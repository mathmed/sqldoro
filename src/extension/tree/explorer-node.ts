import * as vscode from 'vscode'

import type { SelectedScope } from '../../core/editor/selection.ts'
import { CatalogDetail } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { Logger } from '../../core/platform.ts'
import { describeError } from '../../core/text/errors.ts'
import type { ConnectionState } from '../sessions/session-manager.ts'
import type { Glyph } from './node-icons.ts'

export const NodeKind = {
  Folder: 'folder',
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
  // Whether an environment tag counts as production, as the settings say.
  readonly isProduction: (environment: string) => boolean
  // The theme color of a connection, as its label shows it (production in red, then its color, then
  // that of its environment); empty for none.
  readonly tint: (connectionId: string) => string
  readonly log: Logger
  // What a node said of its children when they loaded (how many tables), until the next refresh.
  readonly summaryOf: (node: Pick<ExplorerNode, 'connectionId' | 'id'>) => string | undefined
  // The database (and schema) a connection marks: where the SQL editor in front runs.
  readonly selected: (connectionId: string) => SelectedScope | undefined
  // Where the glyphs of the engines are.
  readonly extensionUri: vscode.Uri
}

// What a node gets while its children load.
export interface LoadContext extends NodeContext {
  // Says something short of the children (how many there are), shown beside the node.
  readonly summarize: (text: string) => void
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
  // The node whose list this one comes from, with the statistics it shows: refreshing this node reads
  // that list again.
  readonly listedBy?: ExplorerNode
  readonly treeItem: (context: NodeContext) => vscode.TreeItem
  readonly children: (context: LoadContext) => Promise<readonly ExplorerNode[]>
}

export interface ItemLook {
  readonly label: string
  readonly icon: vscode.ThemeIcon | Glyph
  readonly isExpandable: boolean
  // What the decorations of the node (the color of its label) are attached to.
  readonly resourceUri?: vscode.Uri
  readonly description?: string
  readonly tooltip?: string
  readonly command?: vscode.Command
}

export const NO_CHILDREN = async (): Promise<readonly ExplorerNode[]> => Promise.resolve([])

// What the commands of tables and views (Show DDL, Open Table Data) are run on.
export function isObjectNode(value: unknown): value is ExplorerNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value.kind === NodeKind.Table || value.kind === NodeKind.View)
  )
}

// What the commands of folders (Rename Folder, Delete Folder) are run on.
export function isFolderNode(value: unknown): value is ExplorerNode {
  return (
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === NodeKind.Folder
  )
}

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
  return Object.assign(item, optionalParts(look))
}

// What a look only sometimes has: a command on a click, a URI for the decorations.
function optionalParts(look: ItemLook): Pick<vscode.TreeItem, 'command' | 'resourceUri'> {
  return {
    ...(look.command === undefined ? {} : { command: look.command }),
    ...(look.resourceUri === undefined ? {} : { resourceUri: look.resourceUri }),
  }
}

export const MessageTone = {
  Info: 'info',
  Error: 'error',
  Progress: 'loading~spin',
} as const

export type MessageTone = (typeof MessageTone)[keyof typeof MessageTone]

// Why a list failed shows in the color of errors.
const TONE_COLORS: ReadonlyMap<MessageTone, string> = new Map([
  [MessageTone.Error, 'errorForeground'],
])

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
    icon: toneIcon(message.tone),
    isExpandable: false,
  }
  return {
    ...node,
    treeItem: () =>
      treeItem(node, message.command === undefined ? look : { ...look, command: message.command }),
    children: NO_CHILDREN,
  }
}

function toneIcon(tone: MessageTone): vscode.ThemeIcon {
  const color = TONE_COLORS.get(tone)
  return new vscode.ThemeIcon(tone, color === undefined ? undefined : new vscode.ThemeColor(color))
}

export function sessionOf(context: NodeContext, connectionId: string): EngineSession {
  const session = context.session(connectionId)
  if (session === undefined) {
    throw new Error('Not connected')
  }
  return session
}

// A list of the explorer with the statistics of its objects; when the server cannot give them (a
// privilege, an older version), the objects still show, without them.
export async function listWithStats<T>(
  context: Pick<NodeContext, 'log'>,
  what: string,
  list: (detail: CatalogDetail) => Promise<T>,
): Promise<T> {
  try {
    return await list(CatalogDetail.Statistics)
  } catch (error) {
    context.log.debug(`Could not read the statistics of ${what}: ${describeError(error)}`)
    return list(CatalogDetail.Names)
  }
}
