import { randomUUID } from 'node:crypto'

import * as vscode from 'vscode'

import type { ConnectionConfig } from '../core/connection/connection.ts'
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
import { QueryRunner } from './editor/query-runner.ts'
import { runServerView } from './editor/server-view.ts'
import { HistoryStore } from './history/history-store.ts'
import { HistoryView } from './history/history-view.ts'
import { systemClock } from './platform/clock.ts'
import { copyRows, exportRows } from './results/results-actions.ts'
import { ResultsPanels } from './results/results-panels.ts'
import type { Services } from './services.ts'
import { readSettings } from './settings.ts'
import { SavedQueryStore } from './snippets/saved-query-store.ts'
import { SavedQueryView } from './snippets/saved-query-view.ts'

export type WorkbenchContext = Pick<
  vscode.ExtensionContext,
  'extensionUri' | 'globalState' | 'workspaceState'
>

export interface QueryServices {
  readonly bindings: EditorBindings
  readonly editorSessions: EditorSessions
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
    status: new EditorStatus({
      bindings: editors.bindings,
      runner,
      connections: access.connection,
      engines: base.engines,
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
  return {
    bindings: new EditorBindings(context.workspaceState, log),
    editorSessions: new EditorSessions({
      open: base.open,
      readSecrets: async (config) => base.secrets.read(config),
      log,
    }),
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
    actionsFor: (uri) => ({
      cancel: () => void runner.cancel(uri),
      serverView: async (tab, view) => runServerView(runner, uri, { tab, view }),
      copy: copyRows,
      export: exportRows,
    }),
  })
  const runner: QueryRunner = createRunner(access, editors, panels)
  return { panels, runner }
}

function createRunner(access: Access, editors: EditorParts, panels: ResultsPanels): QueryRunner {
  return new QueryRunner({
    ...editors,
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
