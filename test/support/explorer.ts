import { vi } from 'vitest'
// Builds the Connections view over in-memory sessions, and walks it like VS Code does.
import type * as vscode from 'vscode'

import {
  type ConnectionConfig,
  EnvironmentTag,
  newConnection,
} from '../../src/core/connection/connection.ts'
import { EngineRegistry } from '../../src/core/engine/engine-registry.ts'
import type { EngineSession } from '../../src/core/engine/engine.ts'
import { SchemaCache } from '../../src/extension/completion/schema-cache.ts'
import { SessionManager } from '../../src/extension/sessions/session-manager.ts'
import type { ExplorerNode } from '../../src/extension/tree/explorer-node.ts'
import { ExplorerProvider } from '../../src/extension/tree/explorer-provider.ts'
import { TableIndex } from '../../src/extension/tree/table-index.ts'
import { fakeEngine, fakeSession } from '../fakes/engine.ts'
import { recordingLogger } from '../fakes/logger.ts'
import { MYSQL_DIALECT } from '../fixtures/dialects.ts'

const POSTGRES = fakeEngine({
  id: 'postgres',
  displayName: 'PostgreSQL',
  defaultPort: 5432,
  urlSchemes: ['postgres'],
})
export const MYSQL = fakeEngine({
  id: 'mysql',
  displayName: 'MySQL',
  defaultPort: 3306,
  urlSchemes: ['mysql'],
  dialect: MYSQL_DIALECT,
})

export const SHOP: ConnectionConfig = {
  ...newConnection('shop', POSTGRES),
  name: 'Shop',
  user: 'app',
  database: 'shop',
  environment: EnvironmentTag.Production,
}

export interface Explorer {
  readonly sut: ExplorerProvider
  readonly sessions: SessionManager
  readonly log: ReturnType<typeof recordingLogger>
}

export interface ExplorerOptions {
  // What the sessions answer; every list is empty by default.
  readonly session?: Partial<EngineSession>
  // Makes every connection attempt fail.
  readonly openError?: Error
  // The clock of the loading nodes; by default no list is ever slow.
  readonly delay?: (milliseconds: number) => Promise<void>
}

// A delay that never ends: no list takes long enough to show a loading node.
export async function never(): Promise<void> {
  return new Promise(() => undefined)
}

export function explorer(
  connections: readonly ConnectionConfig[],
  { session = {}, openError, delay = never }: ExplorerOptions = {},
): Explorer {
  const log = recordingLogger()
  const sessions = new SessionManager({
    open: async (request) =>
      openError === undefined
        ? Promise.resolve({
            engine: request.connection.engine === MYSQL.id ? MYSQL : POSTGRES,
            engineSession: fakeSession({ serverVersion: '18.6', ...session }),
            close: vi.fn(async () => Promise.resolve()),
          })
        : Promise.reject(openError),
    readSecrets: async () => Promise.resolve(new Map()),
    log: recordingLogger(),
    onConnectionLost: vi.fn(),
  })
  const engines = new EngineRegistry([POSTGRES, MYSQL])
  const sut = new ExplorerProvider({
    connections: () => connections,
    sessions,
    engines,
    index: new TableIndex({
      cache: new SchemaCache(log),
      connections: () => connections,
      sessions,
      engines,
      log,
    }),
    policy: () => ({ productionEnvironments: new Set(['prod']) }),
    delay,
    log,
  })
  return { sut, sessions, log }
}

export async function childrenOf(
  sut: ExplorerProvider,
  node?: ExplorerNode,
): Promise<ExplorerNode[]> {
  return sut.getChildren(node)
}

function labelOf(item: vscode.TreeItem): string {
  return typeof item.label === 'string' ? item.label : (item.label?.label ?? '')
}

export function labelsOf(sut: ExplorerProvider, nodes: readonly ExplorerNode[]): string[] {
  return nodes.map((node) => labelOf(sut.getTreeItem(node)))
}

// Opens the nodes along the labels, from the root, and returns the children of the last one.
export async function open(sut: ExplorerProvider, ...labels: string[]): Promise<ExplorerNode[]> {
  let nodes = await childrenOf(sut)
  for (const label of labels) {
    const node = nodes.find((candidate) => labelOf(sut.getTreeItem(candidate)) === label)
    if (node === undefined) {
      throw new Error(`no "${label}" in ${labelsOf(sut, nodes).join(', ')}`)
    }
    nodes = await childrenOf(sut, node)
  }
  return nodes
}

export function itemOf(
  sut: ExplorerProvider,
  nodes: readonly ExplorerNode[],
  label: string,
): vscode.TreeItem {
  const node = nodes.find((candidate) => labelOf(sut.getTreeItem(candidate)) === label)
  if (node === undefined) {
    throw new Error(`no "${label}" in ${labelsOf(sut, nodes).join(', ')}`)
  }
  return sut.getTreeItem(node)
}
