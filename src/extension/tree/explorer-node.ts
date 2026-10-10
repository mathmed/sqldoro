import * as vscode from 'vscode'

import type { EngineSession } from '../../core/engine/engine.ts'
import type { ConnectionState } from '../sessions/session-manager.ts'

export const NodeKind = {
  Connection: 'connection',
  Database: 'database',
  Schema: 'schema',
  Tables: 'tables',
  Views: 'views',
  Table: 'table',
  View: 'view',
  Columns: 'columns',
  Indexes: 'indexes',
  ForeignKeys: 'foreignKeys',
  Column: 'column',
  Index: 'index',
  ForeignKey: 'foreignKey',
  Message: 'message',
} as const

export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind]

// What the nodes read to render themselves and to load their children.
export interface NodeContext {
  readonly state: (connectionId: string) => ConnectionState
  readonly session: (connectionId: string) => EngineSession | undefined
  readonly filter: string
}

// Where a node is in the catalog, for the commands run on it: empty parts are not set.
export interface NodePlace {
  readonly database: string
  readonly schema: string
  readonly name: string
}

export interface ExplorerNode {
  // Stable across refreshes, so that VS Code keeps the node expanded.
  readonly id: string
  readonly kind: NodeKind
  readonly connectionId: string
  readonly place?: NodePlace
  readonly treeItem: (context: NodeContext) => vscode.TreeItem
  readonly children: (context: NodeContext) => Promise<readonly ExplorerNode[]>
}

export interface ItemLook {
  readonly label: string
  readonly icon: vscode.ThemeIcon
  readonly isExpandable: boolean
  readonly description?: string
  readonly tooltip?: string
  readonly command?: vscode.Command
}

export const NO_CHILDREN = async (): Promise<readonly ExplorerNode[]> => Promise.resolve([])

export function nodeId(kind: NodeKind, connectionId: string, path: readonly string[] = []): string {
  return JSON.stringify([kind, connectionId, ...path])
}

export function treeItem(node: Pick<ExplorerNode, 'id' | 'kind'>, look: ItemLook): vscode.TreeItem {
  const state = look.isExpandable
    ? vscode.TreeItemCollapsibleState.Collapsed
    : vscode.TreeItemCollapsibleState.None
  const item = new vscode.TreeItem(look.label, state)
  item.id = node.id
  item.contextValue = node.kind
  item.iconPath = look.icon
  item.description = look.description ?? ''
  item.tooltip = look.tooltip ?? look.label
  if (look.command !== undefined) {
    item.command = look.command
  }
  return item
}

export const MessageTone = {
  Info: 'info',
  Error: 'error',
  Progress: 'loading~spin',
} as const

export type MessageTone = (typeof MessageTone)[keyof typeof MessageTone]

export interface Message {
  readonly text: string
  readonly tone: MessageTone
  readonly command?: vscode.Command
}

// A line of text in place of children: nothing to show, still loading, or why loading failed.
export function messageNode(
  parent: Pick<ExplorerNode, 'connectionId' | 'id'>,
  message: Message,
): ExplorerNode {
  const node = {
    id: nodeId(NodeKind.Message, parent.connectionId, [parent.id, message.text]),
    kind: NodeKind.Message,
    connectionId: parent.connectionId,
  }
  const look = {
    label: message.text,
    icon: new vscode.ThemeIcon(message.tone),
    isExpandable: false,
  }
  return {
    ...node,
    treeItem: () =>
      treeItem(node, message.command === undefined ? look : { ...look, command: message.command }),
    children: NO_CHILDREN,
  }
}

export function sessionOf(context: NodeContext, connectionId: string): EngineSession {
  const session = context.session(connectionId)
  if (session === undefined) {
    throw new Error('Not connected')
  }
  return session
}
