import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import {
  CONNECTION_COLOR_LABELS,
  connectionTint,
  ENVIRONMENT_LABELS,
  labelOf,
  SSL_MODE_LABELS,
} from '../../core/connection/labels.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { shortServerVersion } from '../../core/engine/server-version.ts'
import { CommandId } from '../command-id.ts'
import { environmentBadge } from '../labels.ts'
import { type ConnectionState, ConnectionStatus } from '../sessions/session-manager.ts'
import { databaseNode } from './catalog-nodes.ts'
import {
  type ExplorerNode,
  listWithStats,
  type Message,
  messageNode,
  MessageTone,
  type NodeContext,
  nodeId,
  NodeKind,
  sessionOf,
  treeItem,
} from './explorer-node.ts'

const STATUS_ICONS: ReadonlyMap<string, string> = new Map([
  [ConnectionStatus.Disconnected, 'debug-disconnect'],
  [ConnectionStatus.Connecting, 'loading~spin'],
  [ConnectionStatus.Connected, 'database'],
  [ConnectionStatus.Failed, 'error'],
])
const FAILED_COLOR = 'errorForeground'
// Marks a read-only connection beside its name, where an icon cannot go.
const READ_ONLY_MARK = '🔒'

export function connectionNode(
  connection: ConnectionConfig,
  engines: EngineRegistry,
): ExplorerNode {
  const node: ExplorerNode = {
    id: nodeId(NodeKind.Connection, connection.id),
    kind: NodeKind.Connection,
    connectionId: connection.id,
    treeItem: (context) =>
      connectionItem(node, connection, {
        state: context.state(connection.id),
        engines,
        isProduction: context.isProduction(connection.environment),
      }),
    children: async (context) => connectionChildren(node, connection, { context, engines }),
  }
  return node
}

interface Display {
  readonly state: ConnectionState
  readonly engines: EngineRegistry
  readonly isProduction: boolean
}

function connectionItem(
  node: ExplorerNode,
  connection: ConnectionConfig,
  display: Display,
): vscode.TreeItem {
  const { state } = display
  const item = treeItem(node, {
    label: connection.name,
    description: descriptionOf(connection, state),
    tooltip: tooltipOf(connection, display),
    icon: statusIcon(connection, display),
    isExpandable: true,
  })
  item.contextValue = `${NodeKind.Connection}.${state.status}.${connection.isReadOnly ? 'readOnly' : 'writable'}`
  return item
}

// "PROD · 🔒 · 8.0.45": what matters before writing comes first, then the version of the server
// once connected. Where the server is goes in the tooltip.
function descriptionOf(connection: ConnectionConfig, state: ConnectionState): string {
  const badge = environmentBadge(connection.environment)
  const version =
    state.status === ConnectionStatus.Connected ? shortServerVersion(state.serverVersion) : ''
  return [badge, connection.isReadOnly ? READ_ONLY_MARK : '', version]
    .filter((part) => part !== '')
    .join(' · ')
}

// Failures are painted as errors; otherwise production in red, then the color of the connection,
// then the color of its environment.
function statusIcon(connection: ConnectionConfig, display: Display): vscode.ThemeIcon {
  const { status } = display.state
  const tint =
    status === ConnectionStatus.Failed
      ? FAILED_COLOR
      : connectionTint(connection, display.isProduction)
  return new vscode.ThemeIcon(
    labelOf(STATUS_ICONS, status),
    tint === '' ? undefined : new vscode.ThemeColor(tint),
  )
}

function tooltipOf(connection: ConnectionConfig, { state, engines }: Display): string {
  const engine = engines.find(connection.engine)?.displayName ?? connection.engine
  return [
    connection.name,
    `${engine} · ${addressOf(connection)}`,
    `Environment: ${labelOf(ENVIRONMENT_LABELS, connection.environment)}`,
    connection.isReadOnly ? 'Read-only: sqldoro and the session refuse writes' : 'Writes allowed',
    ...organizationOf(connection),
    `SSL: ${labelOf(SSL_MODE_LABELS, connection.ssl.mode)}`,
    `SSH tunnel: ${tunnelOf(connection)}`,
    `Status: ${statusText(state)}`,
  ].join('\n')
}

// The folder and the color the user gave the connection, when it has them.
function organizationOf({ folder, color }: ConnectionConfig): string[] {
  return [
    ...(folder === '' ? [] : [`Folder: ${folder}`]),
    ...(color === '' ? [] : [`Color: ${labelOf(CONNECTION_COLOR_LABELS, color)}`]),
  ]
}

function addressOf({ user, host, port, database }: ConnectionConfig): string {
  const path = database === '' ? '' : `/${database}`
  return `${user}@${host}:${String(port)}${path}`
}

function tunnelOf({ ssh }: ConnectionConfig): string {
  return ssh === undefined ? 'none' : `${ssh.user}@${ssh.host}:${String(ssh.port)}`
}

function statusText(state: ConnectionState): string {
  switch (state.status) {
    case ConnectionStatus.Connected:
      return `connected, server ${state.serverVersion}`
    case ConnectionStatus.Failed:
      return `failed: ${state.message}`
    default:
      return state.status
  }
}

async function connectionChildren(
  node: ExplorerNode,
  connection: ConnectionConfig,
  { context, engines }: { context: NodeContext; engines: EngineRegistry },
): Promise<readonly ExplorerNode[]> {
  const state = context.state(connection.id)
  if (state.status !== ConnectionStatus.Connected) {
    return [messageNode(node, statusMessage(connection.id, state))]
  }
  const { dialect } = engines.get(connection.engine)
  const session = sessionOf(context, connection.id)
  const databases = await listWithStats(context, node.id, async (detail) =>
    session.listDatabases(detail),
  )
  return databases.map((database) => databaseNode(node, database, dialect))
}

function statusMessage(connectionId: string, state: ConnectionState): Message {
  const command = { command: CommandId.Connect, title: 'Connect', arguments: [connectionId] }
  if (state.status === ConnectionStatus.Connecting) {
    return { text: 'Connecting…', tone: MessageTone.Progress }
  }
  if (state.status === ConnectionStatus.Failed) {
    return { text: state.message, tone: MessageTone.Error, command }
  }
  return { text: 'Not connected: select to connect', tone: MessageTone.Info, command }
}
