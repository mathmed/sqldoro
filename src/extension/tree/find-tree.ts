import * as vscode from 'vscode'

import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { type FoundChanges, foundChanges } from '../../core/table-search/changes.ts'
import {
  type FoundBranch,
  type FoundConnection,
  FoundKind,
  type FoundTables,
  NOTHING_FOUND,
} from '../../core/table-search/found.ts'
import { emptyFindText } from '../../core/table-search/status.ts'
import { tableNode, viewNode } from './catalog-nodes.ts'
import { connectionNode } from './connection-node.ts'
import {
  type ExplorerNode,
  messageNode,
  MessageTone,
  NO_CHILDREN,
  type NodePlace,
  treeItem,
} from './explorer-node.ts'
import { type IconLook, NodeIcon, themeIcon } from './node-icons.ts'
import { markOf } from './scope-mark.ts'
import type { IndexedSource } from './table-index.ts'

// The ids of the found tree are those of the same nodes in the explorer, marked: VS Code keeps
// what the user opened in each tree apart, and gives the explorer back as it was left.
const FIND_MARK = '#find'
const FIND_ROOT = { id: 'find', connectionId: '' }

type Found = FoundTables<IndexedSource>
type Current = () => FoundBranch

const EMPTY: Found = { ...NOTHING_FOUND, roots: [] }

interface Entry {
  readonly branch: FoundBranch
  readonly node: ExplorerNode
  readonly parent: ExplorerNode | undefined
  readonly children: readonly ExplorerNode[]
}

function markedId(key: string): string {
  return `${key}${FIND_MARK}`
}

// What the explorer shows while a table is found: the connections, databases and schemas that
// hold a match, opened down to the tables and views whose name holds the text, highlighted. A node
// stays the same object under the same id whatever the text, so that VS Code updates it in place
// (its label, its count) and keeps it as the user opened or closed it.
export class FindTree {
  readonly #engines: EngineRegistry
  readonly #branches = new WeakSet<ExplorerNode>()
  #found: Found = EMPTY
  #entries = new Map<string, Entry>()
  #roots: readonly ExplorerNode[] = []

  constructor(engines: EngineRegistry) {
    this.#engines = engines
  }

  // Shows what is found now; says what VS Code must draw again.
  update(found: Found): FoundChanges {
    const changes = foundChanges(this.#found, found)
    const previous = this.#entries
    this.#found = found
    this.#entries = new Map()
    this.#roots = found.roots.map((root) =>
      this.#keep(root, { parent: undefined, previous, create: () => this.#connection(root) }),
    )
    return changes
  }

  // Forgets every node: the next update makes them again (the connections were edited).
  reset(): void {
    this.#found = EMPTY
    this.#entries = new Map()
    this.#roots = []
  }

  roots(): readonly ExplorerNode[] {
    if (this.#roots.length > 0) {
      return this.#roots
    }
    const { connectionCount, isLoading } = this.#found
    const tone = connectionCount > 0 && isLoading ? MessageTone.Progress : MessageTone.Info
    return [messageNode(FIND_ROOT, { text: emptyFindText(this.#found), tone })]
  }

  // The children of a branch of the found tree; undefined for any other node (a table found
  // opens on its columns like in the explorer).
  childrenOf(node: ExplorerNode): readonly ExplorerNode[] | undefined {
    if (!this.#branches.has(node)) {
      return undefined
    }
    return this.#entries.get(node.id)?.children ?? []
  }

  parentOf(node: ExplorerNode): ExplorerNode | undefined {
    return this.#entries.get(node.id)?.parent
  }

  // The table or view that matches best.
  bestMatch(): ExplorerNode | undefined {
    const { bestKey } = this.#found
    return bestKey === undefined ? undefined : this.#entries.get(markedId(bestKey))?.node
  }

  // The nodes of these keys that are shown now.
  nodesOf(keys: ReadonlySet<string>): ExplorerNode[] {
    return [...keys].flatMap((key) => {
      const entry = this.#entries.get(markedId(key))
      return entry === undefined ? [] : [entry.node]
    })
  }

  // Keeps the node of a branch that was already shown, and those of its children.
  #keep(branch: FoundBranch, kept: Kept): ExplorerNode {
    const id = markedId(branch.key)
    const node = kept.previous.get(id)?.node ?? kept.create()
    const children = branch.children.map((child) =>
      this.#keep(child, { ...kept, parent: node, create: () => this.#node(child, node) }),
    )
    this.#entries.set(id, { branch, node, parent: kept.parent, children })
    return node
  }

  #current(branch: FoundBranch): Current {
    const id = markedId(branch.key)
    return () => this.#entries.get(id)?.branch ?? branch
  }

  #connection(root: FoundConnection<IndexedSource>): ExplorerNode {
    return this.#opened(connectionNode(root.source.connection, this.#engines), root)
  }

  #node(branch: FoundBranch, parent: ExplorerNode): ExplorerNode {
    if (branch.kind === FoundKind.Table || branch.kind === FoundKind.View) {
      return leafNode(branch, { parent, current: this.#current(branch) })
    }
    return this.#opened(branchNode(branch, this.#current(branch)), branch)
  }

  // A branch shows open the first time; VS Code then keeps it as the user leaves it.
  #opened(inner: ExplorerNode, branch: FoundBranch): ExplorerNode {
    const node = marked(inner, branch, () => ({
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    }))
    this.#branches.add(node)
    return node
  }
}

interface Kept {
  readonly parent: ExplorerNode | undefined
  readonly previous: ReadonlyMap<string, Entry>
  readonly create: () => ExplorerNode
}

// What a node of the found tree shows differently from the same node in the explorer.
type Difference = Partial<Pick<vscode.TreeItem, 'collapsibleState' | 'label'>>

function marked(inner: ExplorerNode, branch: FoundBranch, differ: () => Difference): ExplorerNode {
  const id = markedId(branch.key)
  return {
    ...inner,
    id,
    treeItem: (context) => {
      const item = inner.treeItem(context)
      item.id = id
      return Object.assign(item, differ())
    },
  }
}

interface BranchLook {
  readonly label: string
  readonly icon: IconLook
  readonly place?: NodePlace
}

function branchLook(branch: FoundBranch): BranchLook {
  if (branch.kind === FoundKind.Tables) {
    return { label: 'Tables', icon: NodeIcon.Tables }
  }
  if (branch.kind === FoundKind.Views) {
    return { label: 'Views', icon: NodeIcon.Views }
  }
  const icon = branch.kind === FoundKind.Schema ? NodeIcon.Schema : NodeIcon.Database
  return { label: branch.name, icon, place: { ...branch.scope, name: '' } }
}

// A database, schema or group of the found tree, drawn like in the explorer: a database or schema
// with the mark of the database in front, a group with how many matches it holds.
function branchNode(branch: FoundBranch, current: Current): ExplorerNode {
  const look = branchLook(branch)
  const { place } = look
  const node: ExplorerNode = {
    id: branch.key,
    kind: branch.kind,
    connectionId: branch.connectionId,
    ...(place === undefined ? {} : { place }),
    treeItem: (context) =>
      treeItem(node, {
        label: look.label,
        icon: themeIcon(look.icon),
        description: place === undefined ? String(current().count) : '',
        isExpandable: true,
        ...markOf(node, look, context),
      }),
    children: NO_CHILDREN,
  }
  return node
}

interface Leaf {
  readonly parent: ExplorerNode
  readonly current: Current
}

// A table or view found, the text highlighted in its name; it opens its rows and its columns like
// in the explorer.
function leafNode(branch: FoundBranch, { parent, current }: Leaf): ExplorerNode {
  const { connectionId, scope, name } = branch
  const inner =
    branch.kind === FoundKind.Table
      ? tableNode(parent, scope, { name })
      : viewNode(connectionId, { ...scope, name }, false)
  return marked(inner, branch, () => ({
    label: {
      label: name,
      highlights: current().highlights.map(([start, end]): [number, number] => [start, end]),
    },
  }))
}
