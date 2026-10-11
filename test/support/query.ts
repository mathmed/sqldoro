// The SQL editors of the extension over fake database sessions, the fake VS Code and in-memory
// storage: the runner, its result panels and everything they report to.
import { type Mock, vi } from 'vitest'
import type * as vscode from 'vscode'

import { type ConnectionConfig, newConnection } from '../../src/core/connection/connection.ts'
import type { EditorBinding } from '../../src/core/editor/binding.ts'
import { EngineRegistry } from '../../src/core/engine/engine-registry.ts'
import type { HistoryEntry } from '../../src/core/history/history.ts'
import type { GuardPolicy } from '../../src/core/safety/guard.ts'
import { TransactionMode } from '../../src/core/safety/transaction.ts'
import type { SessionRequest } from '../../src/core/session/open-session.ts'
import { SchemaCache } from '../../src/extension/completion/schema-cache.ts'
import { EditorBindings } from '../../src/extension/editor/bindings.ts'
import { EditorSessions } from '../../src/extension/editor/editor-sessions.ts'
import { QueryRunner } from '../../src/extension/editor/query-runner.ts'
import { checkEditing } from '../../src/extension/edits/edit-check.ts'
import { describeResult } from '../../src/extension/metadata/describe-result.ts'
import { TableMetadata } from '../../src/extension/metadata/table-metadata.ts'
import { PeekCache } from '../../src/extension/navigation/peek.ts'
import type { Clock } from '../../src/extension/platform/clock.ts'
import { actionsOf, type PanelWiring } from '../../src/extension/results/panel-wiring.ts'
import { ResultsPanels } from '../../src/extension/results/results-panels.ts'
import { sourceTitle } from '../../src/extension/results/source-title.ts'
import { StatementGuard } from '../../src/extension/safety/statement-guard.ts'
import { ColumnLayouts } from '../../src/extension/tables/column-layouts.ts'
import { TableNavigations } from '../../src/extension/tables/table-navigations.ts'
import { tableTargetOf } from '../../src/extension/tables/table-uri.ts'
import { EditorTransactions } from '../../src/extension/transactions/editor-transactions.ts'
import { fakeEngine } from '../fakes/engine.ts'
import { FakeMemento } from '../fakes/extension-context.ts'
import { type RecordingLogger, recordingLogger } from '../fakes/logger.ts'
import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../fixtures/dialects.ts'
import {
  diagnosticCollections,
  type FakeTextEditor,
  FakeWebviewPanel,
  languages,
  showEditor,
  Uri,
  webviewPanels,
  workspace,
} from '../vscode.ts'
import { ScriptedEngine } from './sessions.ts'

export const POSTGRES_ENGINE = fakeEngine({
  id: 'postgres',
  displayName: 'PostgreSQL',
  urlSchemes: ['postgres'],
  dialect: POSTGRES_DIALECT,
})
export const MYSQL_ENGINE = fakeEngine({
  id: 'mysql',
  displayName: 'MySQL',
  urlSchemes: ['mysql'],
  dialect: MYSQL_DIALECT,
})

// Writable: the guards of read-only connections have tests of their own.
export const SHOP: ConnectionConfig = {
  ...newConnection('shop', POSTGRES_ENGINE),
  name: 'Shop',
  user: 'app',
  database: 'shop',
  isReadOnly: false,
}
export const CRM: ConnectionConfig = {
  ...newConnection('crm', MYSQL_ENGINE),
  name: 'CRM',
  database: 'crm',
}
export const SHOP_BINDING: EditorBinding = {
  connectionId: 'shop',
  database: 'shop',
  schema: 'sales',
}

export interface QueryHarness {
  readonly runner: QueryRunner
  readonly engine: ScriptedEngine
  readonly bindings: EditorBindings
  readonly editorSessions: EditorSessions
  readonly transactions: EditorTransactions
  readonly panels: ResultsPanels
  readonly diagnostics: vscode.DiagnosticCollection
  readonly records: HistoryEntry[]
  readonly opened: SessionRequest[]
  readonly connect: Mock
  readonly closeSession: Mock
  readonly schemaChanges: string[]
  readonly pickBinding: Mock<() => Promise<EditorBinding | undefined>>
  readonly log: RecordingLogger
  readonly clock: Clock
  readonly connections: Map<string, ConnectionConfig>
  // The table panels, their trails and the catalog they read; the ids of the tabs they opened.
  readonly tables: PanelWiring['tables']
  readonly tabIds: string[]
}

export interface HarnessOptions {
  readonly maxRows?: number
  readonly openError?: Error
  // Off unless a test turns it on.
  readonly autoLimit?: number | null
  readonly transactionMode?: TransactionMode
  readonly policy?: GuardPolicy
}

const PRODUCTION: GuardPolicy = { productionEnvironments: new Set(['prod']) }

function steppingClock(): Clock {
  let now = 0
  return {
    now: () => {
      now += 10
      return now
    },
    timestamp: () => '2026-10-10T03:00:00.000Z',
  }
}

function idMaker(): () => string {
  let next = 0
  return () => {
    next += 1
    return `id-${String(next)}`
  }
}

export function queryHarness(options: HarnessOptions = {}): QueryHarness {
  const { maxRows, openError, autoLimit, transactionMode, policy } = {
    maxRows: 100,
    autoLimit: null,
    transactionMode: TransactionMode.Auto,
    policy: PRODUCTION,
    ...options,
  }
  const engine = new ScriptedEngine()
  const log = recordingLogger()
  const transactions = new EditorTransactions({ defaultMode: () => transactionMode, log })
  const connections = new Map([
    [SHOP.id, SHOP],
    [CRM.id, CRM],
  ])
  const opened: SessionRequest[] = []
  const closeSession = vi.fn(async () => Promise.resolve())
  const editorSessions = new EditorSessions({
    open: async (request) => {
      opened.push(request)
      return openError === undefined
        ? Promise.resolve({
            engine: POSTGRES_ENGINE,
            engineSession: engine.session(),
            close: closeSession,
          })
        : Promise.reject(openError)
    },
    readSecrets: async () => Promise.resolve(new Map()),
    log,
    lifecycle: transactions,
  })
  const bindings = new EditorBindings(new FakeMemento(), log)
  const records: HistoryEntry[] = []
  const schemaChanges: string[] = []
  const pickBinding = vi.fn<() => Promise<EditorBinding | undefined>>(async () =>
    Promise.resolve(undefined),
  )
  const connect = vi.fn(async () =>
    Promise.resolve({
      engine: POSTGRES_ENGINE,
      engineSession: engine.session(),
      close: closeSession,
    }),
  )
  const clock = steppingClock()
  const engines = new EngineRegistry([POSTGRES_ENGINE, MYSQL_ENGINE])
  const navigations = new TableNavigations()
  const metadata = new TableMetadata(new SchemaCache(log))
  const panels = new ResultsPanels({
    extensionUri: Uri.file('/extension') as unknown as vscode.Uri,
    now: clock.now,
    log,
    actionsFor: (uri) => actionsOf(uri, wiring),
    titleOf: (uri) =>
      sourceTitle(uri, {
        connections: (id) => connections.get(id),
        engines,
        tableOf: (source) => navigations.current(source)?.table,
      }),
  })
  const diagnostics = languages.createDiagnosticCollection(
    'sqldoro',
  ) as unknown as vscode.DiagnosticCollection
  const runner: QueryRunner = new QueryRunner({
    bindings,
    editorSessions,
    transactions,
    guard: new StatementGuard({ policy: () => policy, log }),
    connect,
    connections: (id) => connections.get(id),
    engines,
    panels,
    diagnostics,
    record: async (entry) => {
      records.push(entry)
      return Promise.resolve()
    },
    onSchemaChange: (id) => schemaChanges.push(id),
    settings: () => ({ maxRows, historySize: 10, autoLimit, policy, transactionMode }),
    clock,
    createId: idMaker(),
    pickBinding,
    checkEditing: (parts, tab) => {
      void checkEditing(parts, tab, log)
      void describeResult(parts, tab, { metadata, log })
    },
    log,
  })
  const tabIds: string[] = []
  const tables: PanelWiring['tables'] = {
    runner,
    panels,
    navigations,
    layouts: new ColumnLayouts(new FakeMemento(), log),
    metadata,
    peeks: new PeekCache(),
    bindings,
    connections: (id) => connections.get(id),
    engines,
    catalogOf: async () => Promise.resolve(engine.session()),
    connectionOf: (uri) => tableTargetOf(uri)?.connectionId ?? bindings.get(uri)?.connectionId,
    createId: () => {
      tabIds.push(`table-${String(tabIds.length + 1)}`)
      return tabIds.at(-1) ?? ''
    },
    log,
  }
  const wiring: PanelWiring = {
    runner,
    transactions,
    editorSessions,
    tables,
    policy: () => policy,
  }
  return {
    tables,
    tabIds,
    runner,
    engine,
    bindings,
    editorSessions,
    transactions,
    panels,
    diagnostics,
    records,
    opened,
    connect,
    closeSession,
    schemaChanges,
    pickBinding,
    log,
    clock,
    connections,
  }
}

// A SQL editor with this text, on the connection given (none for null), the cursor at 0.
export async function sqlEditor(
  harness: QueryHarness,
  text: string,
  binding: EditorBinding | null = SHOP_BINDING,
): Promise<FakeTextEditor> {
  const document = await workspace.openTextDocument({ language: 'sql', content: text })
  if (binding !== null) {
    await harness.bindings.set(document.uri as unknown as vscode.Uri, binding)
  }
  return showEditor(document)
}

// The result panel of the editor, loaded: it posts what it is told from now on.
export function readyPanel(harness: QueryHarness, editor: FakeTextEditor): FakeWebviewPanel {
  harness.panels.show(editor.document.uri as unknown as vscode.Uri)
  const panel = webviewPanels.at(-1)
  if (!(panel instanceof FakeWebviewPanel)) {
    throw new Error('no result panel')
  }
  panel.webview.send({ type: 'ready' })
  return panel
}

export function lastDiagnostics(): readonly unknown[] | undefined {
  return [...(diagnosticCollections.at(-1)?.entries.values() ?? [])].at(-1)
}

// The tabs of the last messages of the panel, by id.
export function postedTabs(panel: FakeWebviewPanel): Map<string, Record<string, unknown>> {
  const tabs = new Map<string, Record<string, unknown>>()
  for (const message of panel.webview.posted as Record<string, unknown>[]) {
    applyMessage(tabs, message)
  }
  return tabs
}

function applyMessage(
  tabs: Map<string, Record<string, unknown>>,
  message: Record<string, unknown>,
): void {
  if (message['type'] === 'tabs') {
    tabs.clear()
    setTabs(tabs, message['tabs'])
  }
  if (message['type'] === 'tab') {
    setTabs(tabs, [message['tab']])
  }
}

function setTabs(tabs: Map<string, Record<string, unknown>>, changed: unknown): void {
  for (const tab of changed as Record<string, unknown>[]) {
    tabs.set(String(tab['id']), tab)
  }
}
