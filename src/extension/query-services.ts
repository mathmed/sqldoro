import { randomUUID } from 'node:crypto'

import * as vscode from 'vscode'

import type { ConnectionConfig } from '../core/connection/connection.ts'
import { BatchMode, batchMode } from '../core/edits/batch.ts'
import type { EngineSession } from '../core/engine/engine.ts'
import type { Logger } from '../core/platform.ts'
import type { Session } from '../core/session/open-session.ts'
import { SqlCompletionProvider } from './completion/completion-provider.ts'
import { SchemaCache } from './completion/schema-cache.ts'
import { DdlDocuments } from './ddl/ddl-documents.ts'
import { pickBinding } from './editor/binding-picker.ts'
import { EditorBindings } from './editor/bindings.ts'
import { EditorSessions } from './editor/editor-sessions.ts'
import { EditorStatus } from './editor/editor-status.ts'
import { EnvironmentDecorations } from './editor/environment-decorations.ts'
import { loadAllRows } from './editor/load-all.ts'
import { QueryRunner } from './editor/query-runner.ts'
import { refreshTab } from './editor/refresh-rows.ts'
import { runServerView } from './editor/server-view.ts'
import { applyEdits } from './edits/apply-edits.ts'
import { checkEditing } from './edits/edit-check.ts'
import { HistoryStore } from './history/history-store.ts'
import { HistoryView } from './history/history-view.ts'
import { systemClock } from './platform/clock.ts'
import type { PanelActions } from './results/panel-actions.ts'
import { copyColumnName, copyRows, exportRows } from './results/results-actions.ts'
import { ResultsPanels } from './results/results-panels.ts'
import { sourceTitle } from './results/source-title.ts'
import { StatementGuard } from './safety/statement-guard.ts'
import type { Services } from './services.ts'
import { readSettings } from './settings.ts'
import { SavedQueryStore } from './snippets/saved-query-store.ts'
import { SavedQueryView } from './snippets/saved-query-view.ts'
import { filterTable } from './tables/table-filter.ts'
import { CloseReason, EditorTransactions } from './transactions/editor-transactions.ts'
import { TransactionStatusItem } from './transactions/transaction-status.ts'

export type WorkbenchContext = Pick<
  vscode.ExtensionContext,
  'extensionUri' | 'globalState' | 'workspaceState'
>

export interface QueryServices {
  readonly bindings: EditorBindings
  readonly editorSessions: EditorSessions
  readonly transactions: EditorTransactions
  readonly panels: ResultsPanels
  readonly runner: QueryRunner
  readonly history: HistoryStore
  readonly historyView: HistoryView
  readonly savedQueries: SavedQueryStore
  readonly savedQueryView: SavedQueryView
  readonly schemaCache: SchemaCache
  readonly completion: SqlCompletionProvider
  readonly ddl: DdlDocuments
  readonly diagnostics: vscode.DiagnosticCollection
  readonly status: EditorStatus
  readonly transactionStatus: TransactionStatusItem
  readonly decorations: EnvironmentDecorations
  readonly pickBinding: () => ReturnType<typeof pickBinding>
}

// How the phase 2 services reach the connections of phase 1.
interface Access {
  readonly base: Services
  readonly log: Logger
  readonly connection: (id: string) => ConnectionConfig | undefined
  readonly connect: (connection: ConnectionConfig) => Promise<Session>
  readonly session: (id: string) => EngineSession | undefined
}

interface EditorParts {
  readonly bindings: EditorBindings
  readonly editorSessions: EditorSessions
  readonly transactions: EditorTransactions
  readonly history: HistoryStore
  readonly diagnostics: vscode.DiagnosticCollection
  readonly pickBinding: () => ReturnType<typeof pickBinding>
}

const DIAGNOSTICS_NAME = 'sqldoro'

// The SQL editors, their results, the autocomplete, the history and the saved queries, on top of the
// connections of phase 1.
export function createQueryServices(
  context: WorkbenchContext,
  base: Services,
  log: Logger,
): QueryServices {
  const access = accessOf(base, log)
  const editors = createEditorParts(context, access)
  const { panels, runner } = createRunParts(context, access, editors)
  const schemaCache = new SchemaCache(log)
  const savedQueries = new SavedQueryStore(context.globalState, log)
  return {
    ...editors,
    panels,
    runner,
    historyView: new HistoryView(editors.history, () => base.store.list()),
    savedQueries,
    savedQueryView: new SavedQueryView(savedQueries),
    schemaCache,
    completion: createCompletion(access, editors.bindings, schemaCache),
    ddl: new DdlDocuments(access.session),
    ...createIndicators(access, editors, runner),
  }
}

// What tells the user where the editor in front runs: the status bar and the editor tabs.
function createIndicators(
  access: Access,
  editors: EditorParts,
  runner: QueryRunner,
): Pick<QueryServices, 'decorations' | 'status' | 'transactionStatus'> {
  return {
    status: new EditorStatus({
      bindings: editors.bindings,
      runner,
      connections: access.connection,
      engines: access.base.engines,
      policy: () => readSettings().policy,
    }),
    transactionStatus: new TransactionStatusItem(editors),
    decorations: new EnvironmentDecorations({
      bindings: editors.bindings,
      connections: access.connection,
    }),
  }
}

function accessOf(base: Services, log: Logger): Access {
  return {
    base,
    log,
    connection: (id) => base.store.find(id),
    connect: async (connection) => base.sessions.connect(connection),
    session: (id) => base.sessions.session(id)?.engineSession,
  }
}

function createEditorParts(context: WorkbenchContext, { base, log, connect }: Access): EditorParts {
  const transactions = new EditorTransactions({
    defaultMode: () => readSettings().transactionMode,
    log,
  })
  return {
    bindings: new EditorBindings(context.workspaceState, log),
    editorSessions: new EditorSessions({
      open: base.open,
      readSecrets: async (config) => base.secrets.read(config),
      log,
      lifecycle: transactions,
    }),
    transactions,
    history: new HistoryStore(context.globalState, log, () => readSettings().historySize),
    diagnostics: vscode.languages.createDiagnosticCollection(DIAGNOSTICS_NAME),
    pickBinding: async () =>
      pickBinding({ connections: () => base.store.list(), connect, engines: base.engines }),
  }
}

// The panels call the runner back only once the user acts in them, after it exists.
function createRunParts(
  context: WorkbenchContext,
  access: Access,
  editors: EditorParts,
): { readonly panels: ResultsPanels; readonly runner: QueryRunner } {
  const panels = new ResultsPanels({
    extensionUri: context.extensionUri,
    now: systemClock.now,
    log: access.log,
    actionsFor: (uri) => actionsOf(uri, { runner, editors, access }),
    titleOf: (uri) =>
      sourceTitle(uri, { connections: access.connection, engines: access.base.engines }),
  })
  const runner: QueryRunner = createRunner(access, editors, panels)
  return { panels, runner }
}

interface ActionParts {
  readonly runner: QueryRunner
  readonly editors: EditorParts
  readonly access: Access
}

// What the result view of an editor or a table asks of the extension.
function actionsOf(uri: vscode.Uri, { runner, editors, access }: ActionParts): PanelActions {
  return {
    cancel: () => void runner.cancel(uri),
    serverView: async (tab, view) =>
      runServerView(runner, uri, { tab, view, shouldAutoLimit: true }),
    loadAll: async (tab) => loadAllRows(runner, uri, tab),
    refresh: async (tab) => refreshTab(runner, uri, tab),
    filterTable: async (tab, condition) => filterTable(runner, uri, { tab, condition }),
    copy: copyRows,
    export: exportRows,
    copyColumnName,
    applyEdits: async (tab, plan) =>
      applyEdits(
        {
          runner,
          policy: () => readSettings().policy,
          transactions: editors.transactions,
          log: access.log,
          closeSession: async (editor) =>
            editors.editorSessions.release(editor, CloseReason.RollbackFailed),
        },
        uri,
        { tab, plan },
      ),
    isInOpenTransaction: () =>
      batchMode(editors.transactions.of(uri.toString())) === BatchMode.Joined,
  }
}

function createRunner(access: Access, editors: EditorParts, panels: ResultsPanels): QueryRunner {
  return new QueryRunner({
    ...editors,
    guard: new StatementGuard({ policy: () => readSettings().policy, log: access.log }),
    connect: access.connect,
    connections: access.connection,
    engines: access.base.engines,
    panels,
    record: async (entry) => editors.history.add(entry),
    onSchemaChange: (id) => {
      access.base.explorer.refreshConnection(id)
    },
    settings: readSettings,
    clock: systemClock,
    createId: randomUUID,
    checkEditing: (parts, tab) => {
      void checkEditing(parts, tab, access.log)
    },
    log: access.log,
  })
}

function createCompletion(
  access: Access,
  bindings: EditorBindings,
  cache: SchemaCache,
): SqlCompletionProvider {
  return new SqlCompletionProvider({
    bindings,
    connections: access.connection,
    engines: access.base.engines,
    session: access.session,
    cache,
  })
}
