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
import { registerSavedQueryCommands } from './snippets/saved-query-commands.ts'

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
    ...registerCommands(base, query, log),
    ...followDocuments(query, log),
    ...followConnections(base, query, log),
  ]
}

function disposablesOf(query: QueryServices): vscode.Disposable[] {
  const {
    bindings,
    editorSessions,
    panels,
    runner,
    history,
    historyView,
    savedQueries,
    savedQueryView,
    ddl,
    diagnostics,
    status,
  } = query
  return [
    bindings,
    editorSessions,
    panels,
    runner,
    history,
    historyView,
    savedQueries,
    savedQueryView,
    ddl,
    diagnostics,
    status,
  ]
}

function registerCommands(base: Services, query: QueryServices, log: Logger): vscode.Disposable[] {
  const connections = (id: string): ReturnType<Services['store']['find']> => base.store.find(id)
  const { runner, bindings, panels, history, savedQueries, ddl, pickBinding } = query
  return [
    ...registerEditorCommands({ runner, bindings, panels, connections, pickBinding, log }),
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

// A closed editor gives back its connection, its results and its errors.
function followDocuments(query: QueryServices, log: Logger): vscode.Disposable[] {
  const update = (): void => {
    query.status.update()
  }
  return [
    vscode.workspace.onDidCloseTextDocument((document) => {
      query.panels.close(document.uri)
      query.diagnostics.delete(document.uri)
      void query.editorSessions.release(document.uri.toString())
      query.bindings.forgetUntitled(document.uri).catch((error: unknown) => {
        log.warn(`Could not forget the connection of a closed editor: ${describeError(error)}`)
      })
    }),
    vscode.window.onDidChangeActiveTextEditor(update),
    query.bindings.onDidChange(update),
    query.runner.onDidChangeRunning(update),
  ]
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
      query.status.update()
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
