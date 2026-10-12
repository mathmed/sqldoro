import { randomUUID } from 'node:crypto'

import * as vscode from 'vscode'

import type { ConnectionConfig } from '../core/connection/connection.ts'
import type { EngineSession } from '../core/engine/engine.ts'
import type { Logger } from '../core/platform.ts'
import type { Session } from '../core/session/open-session.ts'
import { SqlCompletionProvider } from './completion/completion-provider.ts'
import type { SchemaCache } from './completion/schema-cache.ts'
import { DdlDocuments } from './ddl/ddl-documents.ts'
import { pickBinding } from './editor/binding-picker.ts'
import { EditorBindings } from './editor/bindings.ts'
import { EditorSessions } from './editor/editor-sessions.ts'
import { EditorStatus } from './editor/editor-status.ts'
import { EnvironmentDecorations } from './editor/environment-decorations.ts'
import { QueryRunner } from './editor/query-runner.ts'
import { checkEditing } from './edits/edit-check.ts'
import { HistoryStore } from './history/history-store.ts'
import { HistoryView } from './history/history-view.ts'
import { describeResult } from './metadata/describe-result.ts'
import { TableMetadata } from './metadata/table-metadata.ts'
import { PeekCache } from './navigation/peek.ts'
import { systemClock } from './platform/clock.ts'
import { actionsOf, type PanelWiring } from './results/panel-wiring.ts'
import { ResultsPanels } from './results/results-panels.ts'
import { sourceTitle } from './results/source-title.ts'
import { StatementGuard } from './safety/statement-guard.ts'
import type { Services } from './services.ts'
import { readSettings } from './settings.ts'
import { SavedQueryStore } from './snippets/saved-query-store.ts'
import { SavedQueryView } from './snippets/saved-query-view.ts'
import { ColumnLayouts } from './tables/column-layouts.ts'
import { QueryBoxHeight } from './tables/query-box-height.ts'
import { TableNavigations } from './tables/table-navigations.ts'
import { tableTargetOf } from './tables/table-uri.ts'
import { EditorTransactions } from './transactions/editor-transactions.ts'
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
  readonly tables: PanelWiring['tables']
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
  const { schemaCache } = base
  const { panels, runner, tables } = createRunParts(context, {
    access,
    editors,
    metadata: new TableMetadata(schemaCache),
  })
  const savedQueries = new SavedQueryStore(context.globalState, log)
  return {
    ...editors,
    panels,
    runner,
    tables,
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
      policy: () => readSettings().policy,
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

interface RunSources {
  readonly access: Access
  readonly editors: EditorParts
  readonly metadata: TableMetadata
}

interface RunParts {
  readonly panels: ResultsPanels
  readonly runner: QueryRunner
  readonly tables: PanelWiring['tables']
}

// The panels call the runner and the table panels back only once the user acts in them, after they
// exist.
function createRunParts(context: WorkbenchContext, sources: RunSources): RunParts {
  const { access, editors } = sources
  const navigations = new TableNavigations()
  const panels = new ResultsPanels({
    extensionUri: context.extensionUri,
    now: systemClock.now,
    log: access.log,
    actionsFor: (uri) => actionsOf(uri, wiring),
    titleOf: (uri) =>
      sourceTitle(uri, {
        connections: access.connection,
        engines: access.base.engines,
        tableOf: (source) => navigations.current(source)?.table,
      }),
  })
  const runner: QueryRunner = createRunner(sources, panels)
  const tables = createTables(context, { ...sources, panels, runner, navigations })
  const wiring: PanelWiring = {
    runner,
    transactions: editors.transactions,
    editorSessions: editors.editorSessions,
    tables,
    policy: () => readSettings().policy,
  }
  return { panels, runner, tables }
}

interface TableParts extends RunSources {
  readonly panels: ResultsPanels
  readonly runner: QueryRunner
  readonly navigations: TableNavigations
}

// The table panels: their trails, the layouts of their columns, the height of their query box, the
// rows they peeked at, and the catalog of their connections, read on the session of the explorer.
function createTables(context: WorkbenchContext, parts: TableParts): PanelWiring['tables'] {
  const { access, editors } = parts
  return {
    runner: parts.runner,
    panels: parts.panels,
    navigations: parts.navigations,
    layouts: new ColumnLayouts(context.workspaceState, access.log),
    queryHeight: new QueryBoxHeight(context.workspaceState),
    metadata: parts.metadata,
    peeks: new PeekCache(),
    bindings: editors.bindings,
    connections: access.connection,
    engines: access.base.engines,
    catalogOf: async (connection) => (await access.connect(connection)).engineSession,
    connectionOf: (uri) =>
      tableTargetOf(uri)?.connectionId ?? editors.bindings.get(uri)?.connectionId,
    createId: randomUUID,
    policy: () => readSettings().policy,
    log: access.log,
  }
}

function createRunner(
  { access, editors, metadata }: RunSources,
  panels: ResultsPanels,
): QueryRunner {
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
      void describeResult(parts, tab, { metadata, log: access.log })
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
