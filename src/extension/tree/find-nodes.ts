import * as vscode from 'vscode'

import type { ObjectScope } from '../../core/engine/catalog.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { filterHighlights } from '../../core/text/filter.ts'
import { tableNode, viewNode } from './catalog-nodes.ts'
import { connectionNode } from './connection-node.ts'
import {
  type ExplorerNode,
  NO_CHILDREN,
  type NodeContext,
  nodeId,
  NodeKind,
  treeItem,
} from './explorer-node.ts'
import type { ConnectionObjects, ScopeObjects } from './table-index.ts'

// What the explorer shows while the user finds a table: the connections, databases and schemas
// that hold a match, opened down to the tables and views whose name holds the text, the text
// highlighted. Their ids differ from those of the tree as it is, so that VS Code opens them all and
// gives the tree back as the user left it once the text is cleared.
export interface FindView {
  readonly text: string
  readonly engines: EngineRegistry
}

// What a branch of the found tree holds, already known.
interface Found {
  readonly node: ExplorerNode
  readonly children: readonly ExplorerNode[]
}

export function foundNodes(found: readonly ConnectionObjects[], view: FindView): ExplorerNode[] {
  return found.flatMap((objects) => {
    const scopes = matchingScopes(objects.scopes, view.text)
    return scopes.length === 0 ? [] : [foundConnection(objects, { view, scopes })]
  })
}

function matchingScopes(scopes: readonly ScopeObjects[], text: string): ScopeObjects[] {
  const isMatch = (name: string): boolean => filterHighlights(name, text).length > 0
  return scopes
    .map((scope) => ({
      ...scope,
      tables: scope.tables.filter(isMatch),
      views: scope.views.filter(isMatch),
    }))
    .filter((scope) => scope.tables.length + scope.views.length > 0)
}

interface Matched {
  readonly view: FindView
  readonly scopes: readonly ScopeObjects[]
}

function foundConnection(
  { connection }: ConnectionObjects,
  { view, scopes }: Matched,
): ExplorerNode {
  const { dialect } = view.engines.get(connection.engine)
  const databases = [...new Set(scopes.map(({ scope }) => scope.database))]
  const children = databases.map((database) => {
    const own = scopes.filter(({ scope }) => scope.database === database)
    const inside = dialect.hasSchemas
      ? own.map((objects) =>
          opened(
            {
              node: schemaBranch(connection.id, objects.scope),
              children: groupsOf(connection.id, objects, view),
            },
            view.text,
          ),
        )
      : own.flatMap((objects) => groupsOf(connection.id, objects, view))
    return opened({ node: databaseBranch(connection.id, database), children: inside }, view.text)
  })
  return opened({ node: connectionNode(connection, view.engines), children }, view.text)
}

// The Tables and Views of a namespace that hold a match, each with the matches.
function groupsOf(connectionId: string, objects: ScopeObjects, view: FindView): ExplorerNode[] {
  const { scope } = objects
  return [
    ...foundGroup(connectionId, { scope, kind: NodeKind.Tables, names: objects.tables }, view),
    ...foundGroup(connectionId, { scope, kind: NodeKind.Views, names: objects.views }, view),
  ]
}

interface FoundObjects {
  readonly scope: ObjectScope
  readonly kind: typeof NodeKind.Tables | typeof NodeKind.Views
  readonly names: readonly string[]
}

function foundGroup(connectionId: string, found: FoundObjects, view: FindView): ExplorerNode[] {
  if (found.names.length === 0) {
    return []
  }
  const group = groupBranch(connectionId, { ...found, count: found.names.length })
  const children = found.names.map((name) =>
    highlighted(objectNode(group, { ...found, name }), { name, text: view.text }),
  )
  return [opened({ node: group, children }, view.text)]
}

function objectNode(
  group: ExplorerNode,
  { scope, kind, name }: Omit<FoundObjects, 'names'> & { readonly name: string },
): ExplorerNode {
  return kind === NodeKind.Tables
    ? tableNode(group, scope, { name })
    : viewNode(group.connectionId, { ...scope, name }, false)
}

function databaseBranch(connectionId: string, database: string): ExplorerNode {
  return plainBranch({
    id: nodeId(NodeKind.Database, connectionId, [database]),
    kind: NodeKind.Database,
    connectionId,
    label: database,
    icon: 'database',
  })
}

function schemaBranch(connectionId: string, scope: ObjectScope): ExplorerNode {
  return plainBranch({
    id: nodeId(NodeKind.Schema, connectionId, [scope.database, scope.schema]),
    kind: NodeKind.Schema,
    connectionId,
    label: scope.schema,
    icon: 'symbol-namespace',
  })
}

function groupBranch(
  connectionId: string,
  group: { readonly scope: ObjectScope; readonly kind: NodeKind; readonly count: number },
): ExplorerNode {
  const isTables = group.kind === NodeKind.Tables
  return plainBranch({
    id: nodeId(group.kind, connectionId, [group.scope.database, group.scope.schema]),
    kind: group.kind,
    connectionId,
    label: isTables ? 'Tables' : 'Views',
    icon: isTables ? 'table' : 'eye',
    description: String(group.count),
  })
}

interface Branch {
  readonly id: string
  readonly kind: NodeKind
  readonly connectionId: string
  readonly label: string
  readonly icon: string
  readonly description?: string
}

function plainBranch(branch: Branch): ExplorerNode {
  const node: ExplorerNode = {
    id: branch.id,
    kind: branch.kind,
    connectionId: branch.connectionId,
    treeItem: () =>
      treeItem(node, {
        label: branch.label,
        icon: new vscode.ThemeIcon(branch.icon),
        description: branch.description ?? '',
        isExpandable: true,
      }),
    children: NO_CHILDREN,
  }
  return node
}

// A branch of the found tree: open, under an id of its own for the text.
function opened({ node, children }: Found, text: string): ExplorerNode {
  const id = `${node.id}#find:${text}`
  return {
    ...node,
    id,
    treeItem: (context: NodeContext) => {
      const item = node.treeItem(context)
      item.id = id
      item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
      return item
    },
    children: async () => Promise.resolve(children),
  }
}

// A table or view found: its name with the text highlighted.
function highlighted(
  node: ExplorerNode,
  { name, text }: { readonly name: string; readonly text: string },
): ExplorerNode {
  const highlights = filterHighlights(name, text)
  return {
    ...node,
    treeItem: (context: NodeContext) => {
      const item = node.treeItem(context)
      item.label = { label: name, highlights }
      return item
    },
  }
}
