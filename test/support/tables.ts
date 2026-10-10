// The tables of the explorer opened in panels of their own, over the SQL editor harness: the
// command, the panels, and what follows the connections (a session manager and a store in memory).
import { vi } from 'vitest'
import type * as vscode from 'vscode'

import type { ObjectRef } from '../../src/core/engine/catalog.ts'
import { EngineRegistry } from '../../src/core/engine/engine-registry.ts'
import type { ResultSet } from '../../src/core/results/result-set.ts'
import { CommandId } from '../../src/extension/command-id.ts'
import { SessionManager } from '../../src/extension/sessions/session-manager.ts'
import { ConnectionStore } from '../../src/extension/storage/connection-store.ts'
import { registerTableDataCommands } from '../../src/extension/tables/table-data.ts'
import { followTablePanels } from '../../src/extension/tables/table-panels.ts'
import { tableUri } from '../../src/extension/tables/table-uri.ts'
import { FakeMemento } from '../fakes/extension-context.ts'
import { commands, FakeWebviewPanel, webviewPanels } from '../vscode.ts'
import type { GridResult } from './edits.ts'
import {
  CRM,
  type HarnessOptions,
  MYSQL_ENGINE,
  POSTGRES_ENGINE,
  type QueryHarness,
  queryHarness,
  SHOP,
} from './query.ts'

export const ORDERS_REF: ObjectRef = { database: 'shop', schema: 'sales', name: 'orders' }

// What the explorer gives the commands of a table (or, with kind 'view', of a view).
export function objectNode(
  place: ObjectRef = ORDERS_REF,
  { kind, connectionId }: { readonly kind: string; readonly connectionId: string } = {
    kind: 'table',
    connectionId: SHOP.id,
  },
): unknown {
  return { id: JSON.stringify([kind, connectionId, place]), kind, connectionId, place }
}

export interface TableHarness extends QueryHarness {
  // The ids of the tabs of the tables opened, in order.
  readonly tabIds: string[]
  readonly sessions: SessionManager
  readonly store: ConnectionStore
  readonly dispose: () => void
}

// The harness of the SQL editors, with the command that opens tables and what follows their panels.
export async function tableHarness(options: HarnessOptions = {}): Promise<TableHarness> {
  const harness = queryHarness(options)
  const sessions = new SessionManager({
    open: async () =>
      Promise.resolve({
        engine: POSTGRES_ENGINE,
        engineSession: harness.engine.session(),
        close: vi.fn(async () => Promise.resolve()),
      }),
    readSecrets: async () => Promise.resolve(new Map()),
    log: harness.log,
    onConnectionLost: vi.fn(),
  })
  const tabIds: string[] = []
  const store = new ConnectionStore(new FakeMemento(), harness.log)
  await store.save(SHOP)
  await store.save(CRM)
  const disposables: vscode.Disposable[] = [
    ...registerTableDataCommands({
      runner: harness.runner,
      panels: harness.panels,
      connections: (id) => harness.connections.get(id),
      engines: new EngineRegistry([POSTGRES_ENGINE, MYSQL_ENGINE]),
      createId: () => {
        tabIds.push(`table-${String(tabIds.length + 1)}`)
        return tabIds.at(-1) ?? ''
      },
      log: harness.log,
    }),
    ...followTablePanels({ ...harness, sessions, store }),
  ]
  const dispose = (): void => {
    for (const disposable of disposables) {
      disposable.dispose()
    }
  }
  return { ...harness, tabIds, sessions, store, dispose }
}

export interface TableResult extends GridResult {
  readonly uri: vscode.Uri
}

// Opens the table from the explorer with its panel loaded, and waits until the read is over.
export async function openTable(
  harness: TableHarness,
  node: unknown = objectNode(),
): Promise<TableResult> {
  const opening = commands.executeCommand(CommandId.OpenTableData, node)
  const panel = webviewPanels.at(-1)
  if (!(panel instanceof FakeWebviewPanel)) {
    throw new Error('no table panel')
  }
  panel.webview.send({ type: 'ready' })
  await opening
  const { connectionId, place } = node as { connectionId: string; place: ObjectRef }
  const uri = tableUri({ connectionId, table: place })
  return { uri, panel, tab: tabOf(harness, uri) }
}

// The tab of the table opened last.
export function tabOf(harness: TableHarness, uri: vscode.Uri): ResultSet {
  const tab = harness.panels.get(uri)?.tab(harness.tabIds.at(-1) ?? '')
  if (tab === undefined) {
    throw new Error('the table panel has no tab')
  }
  return tab
}
