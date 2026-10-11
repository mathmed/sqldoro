import {
  databaseStatsDetails,
  databaseStatsSummary,
  objectCount,
  tableStatsDetails,
  tableStatsSummary,
} from '../../core/engine/catalog-text.ts'
import type { DatabaseInfo, ObjectRef, ObjectScope, TableInfo } from '../../core/engine/catalog.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import { matchesFilter } from '../../core/text/filter.ts'
import { CommandId } from '../command-id.ts'
import {
  type ExplorerNode,
  type ItemLook,
  listWithStats,
  type LoadContext,
  messageNode,
  MessageTone,
  type NodeContext,
  nodeId,
  NodeKind,
  type NodePlace,
  sessionOf,
  treeItem,
} from './explorer-node.ts'
import { columnNode, foreignKeyNode, indexNode } from './leaf-nodes.ts'
import { type IconLook, NodeIcon, themeIcon } from './node-icons.ts'
import { markOf } from './scope-mark.ts'

type Children = (context: LoadContext) => Promise<readonly ExplorerNode[]>

const OPEN_DATA = 'Open Table Data'

interface Branch {
  readonly kind: NodeKind
  readonly connectionId: string
  readonly path: readonly string[]
  readonly place?: NodePlace
  readonly listedBy?: ExplorerNode
  readonly look: BranchLook
  readonly children: (node: ExplorerNode) => Children
}

interface BranchLook extends Omit<ItemLook, 'icon' | 'isExpandable'> {
  readonly icon: IconLook
}

// What a branch said of its children once they loaded shows beside its label.
function branch({
  kind,
  connectionId,
  path,
  place,
  listedBy,
  look,
  children,
}: Branch): ExplorerNode {
  const node: ExplorerNode = {
    id: nodeId(kind, connectionId, path),
    kind,
    connectionId,
    ...(place === undefined ? {} : { place }),
    ...(listedBy === undefined ? {} : { listedBy }),
    treeItem: (context) =>
      treeItem(node, {
        ...look,
        icon: themeIcon(look.icon),
        description: context.summaryOf(node) ?? look.description ?? '',
        isExpandable: true,
        ...markOf(node, look, context),
      }),
    children: async (context) => children(node)(context),
  }
  return node
}

function tooltipOf(label: string, details: readonly string[]): string {
  return [label, ...details].join('\n')
}

// The objects that match the filter; their group says how many of how many.
function shown<T extends { readonly name: string }>(
  objects: readonly T[],
  context: LoadContext,
): readonly T[] {
  const matching = objects.filter((object) => matchesFilter(object.name, context.filter))
  context.summarize(objectCount(matching.length, objects.length))
  return matching
}

// An empty list says why it is empty: nothing there, or nothing matching the filter.
function orMessage(
  parent: ExplorerNode,
  nodes: readonly ExplorerNode[],
  emptyText: string,
): readonly ExplorerNode[] {
  return nodes.length > 0
    ? nodes
    : [messageNode(parent, { text: emptyText, tone: MessageTone.Info })]
}

function nothingFound(what: string, filter: string): string {
  const needle = filter.trim()
  return needle === '' ? `No ${what}` : `No ${what} match "${needle}"`
}

export function databaseNode(
  parent: ExplorerNode,
  { name, stats }: DatabaseInfo,
  dialect: Dialect,
): ExplorerNode {
  return branch({
    kind: NodeKind.Database,
    connectionId: parent.connectionId,
    path: [name],
    place: { database: name, schema: dialect.hasSchemas ? '' : name, name: '' },
    listedBy: parent,
    look: {
      label: name,
      icon: NodeIcon.Database,
      description: databaseStatsSummary(stats),
      tooltip: tooltipOf(name, databaseStatsDetails(stats)),
    },
    children: (node) => async (context) =>
      databaseChildren({ node, database: name, dialect }, context),
  })
}

interface DatabaseBranch {
  readonly node: ExplorerNode
  readonly database: string
  readonly dialect: Dialect
}

async function databaseChildren(
  { node, database, dialect }: DatabaseBranch,
  context: NodeContext,
): Promise<readonly ExplorerNode[]> {
  const { connectionId } = node
  if (!dialect.hasSchemas) {
    return objectGroups(connectionId, { database, schema: database })
  }
  const schemas = await sessionOf(context, connectionId).listSchemas(database)
  const nodes = schemas.map((schema) => schemaNode(connectionId, { database, schema: schema.name }))
  return orMessage(node, nodes, 'No schemas')
}

function schemaNode(connectionId: string, scope: ObjectScope): ExplorerNode {
  return branch({
    kind: NodeKind.Schema,
    connectionId,
    path: [scope.database, scope.schema],
    place: { ...scope, name: '' },
    look: { label: scope.schema, icon: NodeIcon.Schema },
    children: () => async () => Promise.resolve(objectGroups(connectionId, scope)),
  })
}

function objectGroups(connectionId: string, scope: ObjectScope): readonly ExplorerNode[] {
  return [tablesNode(connectionId, scope), viewsNode(connectionId, scope)]
}

function tablesNode(connectionId: string, scope: ObjectScope): ExplorerNode {
  return branch({
    kind: NodeKind.Tables,
    connectionId,
    path: [scope.database, scope.schema],
    look: { label: 'Tables', icon: NodeIcon.Tables },
    children: (node) => async (context) => {
      const session = sessionOf(context, connectionId)
      const tables = await listWithStats(context, node.id, async (detail) =>
        session.listTables(scope, detail),
      )
      const nodes = shown(tables, context).map((table) => tableNode(node, scope, table))
      return orMessage(node, nodes, nothingFound('tables', context.filter))
    },
  })
}

function viewsNode(connectionId: string, scope: ObjectScope): ExplorerNode {
  return branch({
    kind: NodeKind.Views,
    connectionId,
    path: [scope.database, scope.schema],
    look: { label: 'Views', icon: NodeIcon.Views },
    children: (node) => async (context) => {
      const views = await sessionOf(context, connectionId).listViews(scope)
      const nodes = shown(views, context).map((view) =>
        viewNode(connectionId, { ...scope, name: view.name }, view.isMaterialized),
      )
      return orMessage(node, nodes, nothingFound('views', context.filter))
    },
  })
}

function objectPath(object: ObjectRef): readonly string[] {
  return [object.database, object.schema, object.name]
}

// A click on the label of a table or view opens its rows; its twistie still opens what is inside.
function opensData(node: ExplorerNode): ExplorerNode {
  const opening: ExplorerNode = {
    ...node,
    treeItem: (context) => {
      const item = node.treeItem(context)
      item.command = { command: CommandId.OpenTableData, title: OPEN_DATA, arguments: [opening] }
      return item
    },
  }
  return opening
}

export function tableNode(
  group: ExplorerNode,
  scope: ObjectScope,
  { name, stats }: TableInfo,
): ExplorerNode {
  const { connectionId } = group
  const table = { ...scope, name }
  return opensData(
    branch({
      kind: NodeKind.Table,
      connectionId,
      path: objectPath(table),
      place: table,
      listedBy: group,
      look: {
        label: name,
        icon: NodeIcon.Table,
        description: tableStatsSummary(stats),
        tooltip: tooltipOf(name, tableStatsDetails(stats)),
      },
      children: () => async () =>
        Promise.resolve([
          columnsNode(connectionId, table),
          indexesNode(connectionId, table),
          foreignKeysNode(connectionId, table),
        ]),
    }),
  )
}

export function viewNode(
  connectionId: string,
  view: ObjectRef,
  isMaterialized: boolean,
): ExplorerNode {
  return opensData(
    branch({
      kind: NodeKind.View,
      connectionId,
      path: objectPath(view),
      place: view,
      look: {
        label: view.name,
        icon: NodeIcon.View,
        description: isMaterialized ? 'materialized' : '',
      },
      children: (node) => async (context) => columnChildren(node, view, context),
    }),
  )
}

async function columnChildren(
  node: ExplorerNode,
  object: ObjectRef,
  context: NodeContext,
): Promise<readonly ExplorerNode[]> {
  const columns = await sessionOf(context, node.connectionId).listColumns(object)
  return orMessage(
    node,
    columns.map((column) => columnNode(node.connectionId, object, column)),
    'No columns',
  )
}

function columnsNode(connectionId: string, table: ObjectRef): ExplorerNode {
  return branch({
    kind: NodeKind.Columns,
    connectionId,
    path: objectPath(table),
    look: { label: 'Columns', icon: NodeIcon.Columns },
    children: (node) => async (context) => columnChildren(node, table, context),
  })
}

function indexesNode(connectionId: string, table: ObjectRef): ExplorerNode {
  return branch({
    kind: NodeKind.Indexes,
    connectionId,
    path: objectPath(table),
    look: { label: 'Indexes', icon: NodeIcon.Indexes },
    children: (node) => async (context) => {
      const indexes = await sessionOf(context, connectionId).listIndexes(table)
      return orMessage(
        node,
        indexes.map((index) => indexNode(connectionId, table, index)),
        'No indexes',
      )
    },
  })
}

function foreignKeysNode(connectionId: string, table: ObjectRef): ExplorerNode {
  return branch({
    kind: NodeKind.ForeignKeys,
    connectionId,
    path: objectPath(table),
    look: { label: 'Foreign Keys', icon: NodeIcon.ForeignKeys },
    children: (node) => async (context) => {
      const foreignKeys = await sessionOf(context, connectionId).listForeignKeys(table)
      return orMessage(
        node,
        foreignKeys.map((foreignKey) => foreignKeyNode(connectionId, table, foreignKey)),
        'No foreign keys',
      )
    },
  })
}
