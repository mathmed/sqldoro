import { randomUUID } from 'node:crypto'

import * as vscode from 'vscode'

import type { Logger } from '../core/platform.ts'
import { describeError } from '../core/text/errors.ts'
import { SQL_LANGUAGE, ViewId } from './command-id.ts'
import { TRIGGER_CHARACTERS } from './completion/completion-provider.ts'
import { registerDdlCommands } from './ddl/ddl-commands.ts'
import { DDL_SCHEME } from './ddl/ddl-documents.ts'
import { registerEditorCommands } from './editor/editor-commands.ts'
import { registerHistoryCommands } from './history/history-commands.ts'
import { systemClock } from './platform/clock.ts'
import type { QueryServices } from './query-services.ts'
import type { Services } from './services.ts'
import { ConnectionStatus } from './sessions/session-manager.ts'
import { readSettings } from './settings.ts'
import { registerSavedQueryCommands } from './snippets/saved-query-commands.ts'
import { registerTableDataCommands } from './tables/table-data.ts'
import { followTablePanels } from './tables/table-panels.ts'
import { watchClosedEditors } from './transactions/closed-editors.ts'
import { CloseReason } from './transactions/editor-transactions.ts'
import { registerTransactionCommands } from './transactions/transaction-commands.ts'

const LIVE_STATES: ReadonlySet<string> = new Set([
  ConnectionStatus.Connected,
  ConnectionStatus.Connecting,
])

// The views, providers and commands of the SQL editors, and what keeps them in step with the
// connections.
export function registerQueryFeatures(
  base: Services,
  query: QueryServices,
  log: Logger,
): vscode.Disposable[] {
  return [
    ...disposablesOf(query),
    vscode.window.createTreeView(ViewId.History, { treeDataProvider: query.historyView }),
    vscode.window.createTreeView(ViewId.SavedQueries, { treeDataProvider: query.savedQueryView }),
    vscode.languages.registerCompletionItemProvider(
      { language: SQL_LANGUAGE },
      query.completion,
      ...TRIGGER_CHARACTERS,
    ),
    vscode.workspace.registerTextDocumentContentProvider(DDL_SCHEME, query.ddl),
    vscode.window.registerFileDecorationProvider(query.decorations),
    ...registerCommands(base, query, log),
    ...followDocuments(query, log),
    ...followConnections(base, query, log),
    ...registerTables(base, query, log),
  ]
}

function disposablesOf(query: QueryServices): vscode.Disposable[] {
  const { bindings, editorSessions, transactions, panels, runner, history, historyView } = query
  const { savedQueries, savedQueryView, ddl, diagnostics, status, transactionStatus } = query
  return [
    bindings,
    editorSessions,
    transactions,
    panels,
    runner,
    history,
    historyView,
    savedQueries,
    savedQueryView,
    ddl,
    diagnostics,
    status,
    transactionStatus,
    query.decorations,
  ]
}

function registerCommands(base: Services, query: QueryServices, log: Logger): vscode.Disposable[] {
  const connections = (id: string): ReturnType<Services['store']['find']> => base.store.find(id)
  const { runner, bindings, transactions, panels, history, savedQueries, ddl, pickBinding } = query
  return [
    ...registerEditorCommands({
      runner,
      bindings,
      transactions,
      panels,
      connections,
      pickBinding,
      log,
    }),
    ...registerTransactionCommands({ ...query, log }),
    watchClosedEditors({ ...query, log }),
    ...registerHistoryCommands({ history, bindings, runner, connections, log }),
    ...registerSavedQueryCommands({
      store: savedQueries,
      bindings,
      clock: systemClock,
      createId: randomUUID,
      log,
    }),
    ...registerDdlCommands({ ddl, log }),
  ]
}

// The rows of the tables opened from the explorer, each in a panel of its own.
function registerTables(base: Services, query: QueryServices, log: Logger): vscode.Disposable[] {
  return [
    ...registerTableDataCommands({
      runner: query.runner,
      panels: query.panels,
      connections: (id) => base.store.find(id),
      engines: base.engines,
      createId: randomUUID,
      log,
    }),
    ...followTablePanels({ ...query, sessions: base.sessions, store: base.store }),
  ]
}

// A closed editor gives back its connection (rolling back what it left open), its results and its
// errors.
function followDocuments(query: QueryServices, log: Logger): vscode.Disposable[] {
  const update = (): void => {
    updateStatus(query)
  }
  return [
    vscode.workspace.onDidCloseTextDocument((document) => {
      query.panels.close(document.uri)
      query.diagnostics.delete(document.uri)
      void releaseClosed(query, document.uri.toString())
      query.bindings.forgetUntitled(document.uri).catch((error: unknown) => {
        log.warn(`Could not forget the connection of a closed editor: ${describeError(error)}`)
      })
    }),
    vscode.window.onDidChangeActiveTextEditor(update),
    query.bindings.onDidChange(() => {
      update()
      query.decorations.refresh()
    }),
    query.runner.onDidChangeRunning(update),
    query.transactions.onDidChange(update),
  ]
}

async function releaseClosed(query: QueryServices, uri: string): Promise<void> {
  await query.editorSessions.release(uri, CloseReason.EditorClosed)
  query.transactions.forget(uri)
}

function updateStatus(query: QueryServices): void {
  query.status.update()
  query.transactionStatus.update()
}

// Editors leave a connection that is disconnected, edited or deleted; the autocomplete forgets
// what the explorer refreshes.
function followConnections(base: Services, query: QueryServices, log: Logger): vscode.Disposable[] {
  return [
    base.sessions.onDidChange((connectionId) => {
      if (!LIVE_STATES.has(base.sessions.state(connectionId).status)) {
        void query.editorSessions.releaseConnection(connectionId)
      }
    }),
    base.explorer.onDidChangeTreeData((node) => {
      query.schemaCache.invalidate(node?.connectionId)
    }),
    base.store.onDidChange(() => {
      updateStatus(query)
      query.decorations.refresh()
      query.panels.followConnections(base.store.list(), readSettings().policy)
      void forgetDeleted(base, query).catch((error: unknown) => {
        log.warn(`Could not forget a deleted connection: ${describeError(error)}`)
      })
    }),
  ]
}

// The history and the editors of a deleted connection go with it.
async function forgetDeleted(base: Services, query: QueryServices): Promise<void> {
  const ids = new Set(base.store.list().map((connection) => connection.id))
  await query.history.retain(ids)
  await query.bindings.retain(ids)
}
