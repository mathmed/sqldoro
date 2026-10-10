import * as vscode from 'vscode'

import type { ObjectRef, ObjectScope } from '../../core/engine/catalog.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import { matchesFilter } from '../../core/text/filter.ts'
import { CommandId } from '../command-id.ts'
import {
  type ExplorerNode,
  type ItemLook,
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

type Children = (context: NodeContext) => Promise<readonly ExplorerNode[]>

const OPEN_DATA = 'Open Table Data'

interface Branch {
  readonly kind: NodeKind
  readonly connectionId: string
  readonly path: readonly string[]
  readonly place?: NodePlace
  readonly look: Omit<ItemLook, 'isExpandable'>
  readonly children: (node: ExplorerNode) => Children
}

function branch({ kind, connectionId, path, place, look, children }: Branch): ExplorerNode {
  const node: ExplorerNode = {
    id: nodeId(kind, connectionId, path),
    kind,
    connectionId,
    ...(place === undefined ? {} : { place }),
    treeItem: () => treeItem(node, { ...look, isExpandable: true }),
    children: async (context) => children(node)(context),
  }
  return node
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
  connectionId: string,
  database: string,
  dialect: Dialect,
): ExplorerNode {
  return branch({
    kind: NodeKind.Database,
    connectionId,
    path: [database],
    place: { database, schema: dialect.hasSchemas ? '' : database, name: '' },
    look: { label: database, icon: new vscode.ThemeIcon('database') },
    children: (node) => async (context) => {
      if (!dialect.hasSchemas) {
        return objectGroups(connectionId, { database, schema: database })
      }
      const schemas = await sessionOf(context, connectionId).listSchemas(database)
      const nodes = schemas.map((schema) =>
        schemaNode(connectionId, { database, schema: schema.name }),
      )
      return orMessage(node, nodes, 'No schemas')
    },
  })
}

function schemaNode(connectionId: string, scope: ObjectScope): ExplorerNode {
  return branch({
    kind: NodeKind.Schema,
    connectionId,
    path: [scope.database, scope.schema],
    place: { ...scope, name: '' },
    look: { label: scope.schema, icon: new vscode.ThemeIcon('symbol-namespace') },
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
    look: { label: 'Tables', icon: new vscode.ThemeIcon('table') },
    children: (node) => async (context) => {
      const tables = await sessionOf(context, connectionId).listTables(scope)
      const matching = tables.filter((table) => matchesFilter(table.name, context.filter))
      const nodes = matching.map((table) => tableNode(connectionId, { ...scope, name: table.name }))
      return orMessage(node, nodes, nothingFound('tables', context.filter))
    },
  })
}

function viewsNode(connectionId: string, scope: ObjectScope): ExplorerNode {
  return branch({
    kind: NodeKind.Views,
    connectionId,
    path: [scope.database, scope.schema],
    look: { label: 'Views', icon: new vscode.ThemeIcon('eye') },
    children: (node) => async (context) => {
      const views = await sessionOf(context, connectionId).listViews(scope)
      const matching = views.filter((view) => matchesFilter(view.name, context.filter))
      const nodes = matching.map((view) =>
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

function tableNode(connectionId: string, table: ObjectRef): ExplorerNode {
  return opensData(
    branch({
      kind: NodeKind.Table,
      connectionId,
      path: objectPath(table),
      place: table,
      look: { label: table.name, icon: new vscode.ThemeIcon('table') },
      children: () => async () =>
        Promise.resolve([
          columnsNode(connectionId, table),
          indexesNode(connectionId, table),
          foreignKeysNode(connectionId, table),
        ]),
    }),
  )
}

function viewNode(connectionId: string, view: ObjectRef, isMaterialized: boolean): ExplorerNode {
  return opensData(
    branch({
      kind: NodeKind.View,
      connectionId,
      path: objectPath(view),
      place: view,
      look: {
        label: view.name,
        icon: new vscode.ThemeIcon('eye'),
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
    look: { label: 'Columns', icon: new vscode.ThemeIcon('symbol-field') },
    children: (node) => async (context) => columnChildren(node, table, context),
  })
}

function indexesNode(connectionId: string, table: ObjectRef): ExplorerNode {
  return branch({
    kind: NodeKind.Indexes,
    connectionId,
    path: objectPath(table),
    look: { label: 'Indexes', icon: new vscode.ThemeIcon('list-ordered') },
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
    look: { label: 'Foreign Keys', icon: new vscode.ThemeIcon('references') },
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
