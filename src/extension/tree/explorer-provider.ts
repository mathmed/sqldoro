import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { type SelectedScope, showsScope } from '../../core/editor/selection.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { Logger } from '../../core/platform.ts'
import { type GuardPolicy, isProduction } from '../../core/safety/guard.ts'
import type { SearchStatus } from '../../core/table-search/status.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SessionManager } from '../sessions/session-manager.ts'
import { connectionNode } from './connection-node.ts'
import type { DatabaseSelection } from './database-selection.ts'
import { type ExplorerNode, messageNode, MessageTone, type NodeContext } from './explorer-node.ts'
import { FindMode } from './find-mode.ts'
import { folderChildren } from './folder-node.ts'
import { loadingText } from './loading-text.ts'
import { type ScopePlace, scopePlace } from './scope-mark.ts'
import type { TableIndex } from './table-index.ts'

export interface ExplorerDependencies {
  readonly connections: () => readonly ConnectionConfig[]
  readonly sessions: SessionManager
  readonly engines: EngineRegistry
  readonly index: Pick<TableIndex, 'load' | 'onDidChange' | 'snapshot'>
  readonly policy: () => GuardPolicy
  // Resolves after this many milliseconds: the clock of the loading nodes.
  readonly delay: (milliseconds: number) => Promise<void>
  // The database each connection marks; a change draws only the nodes whose mark changed.
  readonly selection: Pick<DatabaseSelection, 'onDidChange' | 'selected'>
  readonly extensionUri: vscode.Uri
  readonly log: Logger
}

type Children = Promise<readonly ExplorerNode[]>
// What VS Code draws again: a node, some nodes, or the whole tree.
export type Changed = ExplorerNode | ExplorerNode[] | undefined

interface Drawn {
  readonly node: ExplorerNode
  readonly place: ScopePlace
}

// What the view loaded under a connection: the children of its nodes, and what the nodes said of
// them (how many tables a group holds).
interface Loaded {
  readonly children: Map<string, Children>
  readonly summaries: Map<string, string>
}

// A list that loads in less than this shows no loading node: no flicker for a fast server.
const LOADING_DELAY_MS = 150

// The Connections view: connections in their folders, and the children of a node, loaded when it
// opens and kept until it is refreshed or its connection changes state. A list slow to load shows a
// line that says so; a failure becomes a line in the tree instead of an error dialog. While the user
// finds a table, the view shows only the tables and views whose name matches the text (FindMode).
// The nodes the user opens and closes are remembered, so that a node shown again (the tree given
// back after a find) is as it was left.
export class ExplorerProvider implements vscode.TreeDataProvider<ExplorerNode>, vscode.Disposable {
  readonly #dependencies: ExplorerDependencies
  readonly #changes = new vscode.EventEmitter<Changed>()
  readonly #refreshes = new vscode.EventEmitter<string | undefined>()
  readonly #loaded = new Map<string, Loaded>()
  readonly #roots = new Map<string, ExplorerNode>()
  // The databases and schemas the view drew, by id: those a change of the mark draws again.
  readonly #scopeNodes = new Map<string, Drawn>()
  readonly #expanded = new Map<string, boolean>()
  readonly #find: FindMode
  readonly #subscriptions: vscode.Disposable[]
  #filter = ''
  readonly onDidChangeTreeData = this.#changes.event
  // A connection (or all of them, undefined) whose catalog is read again: what was kept of it is
  // forgotten. Nothing else (a find, the mark of a database) makes the catalog read again.
  readonly onDidRefresh = this.#refreshes.event
  readonly onDidChangeFind: vscode.Event<SearchStatus>

  constructor(dependencies: ExplorerDependencies) {
    this.#dependencies = dependencies
    this.#find = new FindMode({
      ...dependencies,
      redraw: (nodes) => {
        this.#changes.fire(nodes === undefined ? undefined : [...nodes])
      },
    })
    this.onDidChangeFind = this.#find.onDidChange
    this.#subscriptions = [
      dependencies.sessions.onDidChange((connectionId) => {
        this.refreshConnection(connectionId)
      }),
      dependencies.selection.onDidChange((scopes) => {
        this.#redrawMarks(scopes)
      }),
    ]
  }

  get filter(): string {
    return this.#filter
  }

  // The text the explorer is filtered by, trimmed; empty when it shows the tree as it is.
  get find(): string {
    return this.#find.text
  }

  get findStatus(): SearchStatus {
    return this.#find.status
  }

  setFilter(filter: string): void {
    this.#filter = filter.trim()
    this.refresh()
  }

  // Shows only the tables and views whose name holds the text, as typed; an empty text shows the
  // tree again.
  setFind(text: string): void {
    this.#find.setText(text)
  }

  // Loads the tables to find, before anything is typed.
  prepareFind(): void {
    this.#find.prepare()
  }

  // The table or view that matches best, if any.
  bestMatch(): ExplorerNode | undefined {
    return this.#find.isActive ? this.#find.tree.bestMatch() : undefined
  }

  // What the user did to a node: VS Code tells the tree view.
  remember(node: ExplorerNode, isExpanded: boolean): void {
    this.#expanded.set(node.id, isExpanded)
  }

  getTreeItem(node: ExplorerNode): vscode.TreeItem {
    const place = scopePlace(node)
    if (place !== undefined) {
      this.#scopeNodes.set(node.id, { node, place })
    }
    const item = node.treeItem(this.#context())
    const state = rememberedState(item.collapsibleState, this.#expanded.get(node.id))
    if (state !== undefined) {
      item.collapsibleState = state
    }
    return item
  }

  // Only the found tree knows the parents of its nodes: it is the one revealed.
  getParent(node: ExplorerNode): ExplorerNode | undefined {
    return this.#find.tree.parentOf(node)
  }

  async getChildren(node?: ExplorerNode): Promise<ExplorerNode[]> {
    if (node === undefined) {
      return this.#find.isActive ? [...this.#find.tree.roots()] : this.#rootNodes()
    }
    const found = this.#find.tree.childrenOf(node)
    if (found !== undefined) {
      return [...found]
    }
    const loaded = this.#loadedOf(node.connectionId)
    const known = loaded.children.get(node.id)
    return [...(await (known ?? this.#loadSlowly(node, loaded)))]
  }

  // A node that shows statistics of the list it comes from has that list read again.
  refresh(node?: ExplorerNode): void {
    if (node === undefined) {
      this.#loaded.clear()
      this.#scopeNodes.clear()
      this.#find.reset()
    } else {
      this.#loaded.delete(node.connectionId)
    }
    this.#refreshes.fire(node?.connectionId)
    this.#changes.fire(node?.listedBy ?? node)
  }

  dispose(): void {
    for (const subscription of this.#subscriptions) {
      subscription.dispose()
    }
    this.#find.dispose()
    this.#changes.dispose()
    this.#refreshes.dispose()
  }

  // Only the icon and the tooltip of these nodes change: their children stay as they were loaded.
  #redrawMarks(scopes: readonly SelectedScope[]): void {
    for (const { node, place } of this.#scopeNodes.values()) {
      const isMarked = (scope: SelectedScope): boolean =>
        scope.connectionId === node.connectionId && showsScope(place, scope)
      if (scopes.some(isMarked)) {
        this.#changes.fire(node)
      }
    }
  }

  #rootNodes(): ExplorerNode[] {
    this.#roots.clear()
    const nodeOf = (connection: ConnectionConfig): ExplorerNode => {
      const node = connectionNode(connection, this.#dependencies.engines)
      this.#roots.set(connection.id, node)
      return node
    }
    return folderChildren({ connections: this.#dependencies.connections(), nodeOf }, '')
  }

  // A list that takes a while shows a line that says what loads, and the list once it is here.
  async #loadSlowly(node: ExplorerNode, loaded: Loaded): Children {
    const loading = this.#load(node, loaded)
    const isSlow = await Promise.race([
      loading.then(() => false),
      this.#dependencies.delay(LOADING_DELAY_MS).then(() => true),
    ])
    if (!isSlow) {
      return loading
    }
    void loading.then(() => {
      this.#changes.fire(node)
    })
    return [messageNode(node, { text: loadingText(node.kind), tone: MessageTone.Progress })]
  }

  async #load(node: ExplorerNode, loaded: Loaded): Children {
    const children = this.#read(node, loaded).catch((error: unknown) => {
      loaded.children.delete(node.id)
      const text = describeError(error)
      this.#dependencies.log.warn(`Could not load the children of ${node.id}: ${text}`)
      return [messageNode(node, { text, tone: MessageTone.Error })]
    })
    loaded.children.set(node.id, children)
    return children
  }

  // VS Code draws a node again only when told: a node that summarized its children is redrawn.
  async #read(node: ExplorerNode, loaded: Loaded): Children {
    const summarize = (text: string): void => {
      loaded.summaries.set(node.id, text)
    }
    const children = await node.children({ ...this.#context(), summarize })
    if (loaded.summaries.has(node.id)) {
      this.#changes.fire(node)
    }
    return children
  }

  #loadedOf(connectionId: string): Loaded {
    const existing = this.#loaded.get(connectionId)
    if (existing !== undefined) {
      return existing
    }
    const loaded = { children: new Map<string, Children>(), summaries: new Map<string, string>() }
    this.#loaded.set(connectionId, loaded)
    return loaded
  }

  // Reloads everything under a connection (after a statement changed its schema, for one).
  refreshConnection(connectionId: string): void {
    this.#loaded.delete(connectionId)
    this.#refreshes.fire(connectionId)
    const node = this.#roots.get(connectionId)
    if (node !== undefined) {
      this.#changes.fire(node)
    }
  }

  #context(): NodeContext {
    const { sessions, log, policy, selection, extensionUri } = this.#dependencies
    return {
      state: (connectionId) => sessions.state(connectionId),
      session: (connectionId) => sessions.session(connectionId)?.engineSession,
      filter: this.#filter,
      isProduction: (environment) => isProduction(environment, policy()),
      log,
      summaryOf: (node) => this.#loaded.get(node.connectionId)?.summaries.get(node.id),
      selected: (connectionId) => selection.selected(connectionId),
      extensionUri,
    }
  }
}

// A node the user opened or closed shows so when VS Code makes it again; undefined keeps the state
// the node gives.
function rememberedState(
  state: vscode.TreeItemCollapsibleState | undefined,
  isExpanded: boolean | undefined,
): vscode.TreeItemCollapsibleState | undefined {
  if (isExpanded === undefined || state === vscode.TreeItemCollapsibleState.None) {
    return undefined
  }
  return isExpanded
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.Collapsed
}
