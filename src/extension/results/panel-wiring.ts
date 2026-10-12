import * as vscode from 'vscode'

import { BatchMode, batchMode } from '../../core/edits/batch.ts'
import type { GuardPolicy } from '../../core/safety/guard.ts'
import { CommandId } from '../command-id.ts'
import type { EditorSessions } from '../editor/editor-sessions.ts'
import { loadAllRows } from '../editor/load-all.ts'
import type { QueryRunner } from '../editor/query-runner.ts'
import { runServerView } from '../editor/server-view.ts'
import { type ApplyContext, applyEdits } from '../edits/apply-edits.ts'
import {
  goToStep,
  type NavigationContext,
  openLink,
  openReference,
} from '../navigation/navigate.ts'
import { type PeekContext, peekLink } from '../navigation/peek.ts'
import { countReferences } from '../navigation/reference-counts.ts'
import { openTableInEditor, type TableEditorContext } from '../tables/open-in-editor.ts'
import { tableActions } from '../tables/table-actions.ts'
import { isTableKey } from '../tables/table-uri.ts'
import { CloseReason, type EditorTransactions } from '../transactions/editor-transactions.ts'
import type { PanelActions } from './panel-actions.ts'
import { copyColumnName, copyRows, exportRows } from './results-actions.ts'

// What the result views work with: the runner, the sessions and transactions of the editors, the
// table panels with their trails, and the guard policy.
export interface PanelWiring {
  readonly runner: QueryRunner
  readonly transactions: EditorTransactions
  readonly editorSessions: EditorSessions
  readonly tables: NavigationContext & PeekContext & TableEditorContext
  readonly policy: () => GuardPolicy
}

// What the result view of an editor or a table asks of the extension: a table panel reads its rows
// again as a step of its trail.
export function actionsOf(uri: vscode.Uri, wiring: PanelWiring): PanelActions {
  const actions = { ...runActions(uri, wiring), ...navigationActions(uri, wiring) }
  return isTableKey(uri.toString())
    ? { ...actions, ...tableActions(wiring.tables, uri, actions) }
    : actions
}

function runActions(
  uri: vscode.Uri,
  wiring: PanelWiring,
): Omit<PanelActions, keyof ReturnType<typeof navigationActions>> {
  const { runner, transactions } = wiring
  return {
    cancel: () => void runner.cancel(uri),
    serverView: async (tab, view) =>
      runServerView(runner, uri, { tab, view, shouldAutoLimit: true }),
    loadAll: async (tab) => loadAllRows(runner, uri, tab),
    // Only the rows of a table are read again, and with a WHERE: an editor runs its query instead.
    refresh: async () => Promise.resolve(),
    filterTable: async () => Promise.resolve(),
    copy: copyRows,
    export: exportRows,
    copyColumnName,
    applyEdits: async (tab, plan) => applyEdits(applyContext(wiring), uri, { tab, plan }),
    isInOpenTransaction: () => batchMode(transactions.of(uri.toString())) === BatchMode.Joined,
    // Only a table panel has a query box.
    runQuery: async () => Promise.resolve(),
    openSqlInEditor: async () => Promise.resolve(),
    setQueryHeight: async () => Promise.resolve(),
  }
}

function applyContext(wiring: PanelWiring): ApplyContext {
  return {
    runner: wiring.runner,
    policy: wiring.policy,
    transactions: wiring.transactions,
    log: wiring.tables.log,
    closeSession: async (editor) =>
      wiring.editorSessions.release(editor, CloseReason.RollbackFailed),
  }
}

function navigationActions(
  uri: vscode.Uri,
  { tables }: PanelWiring,
): Pick<
  PanelActions,
  | 'allowWrites'
  | 'countReferences'
  | 'goToStep'
  | 'navigate'
  | 'openInEditor'
  | 'openReference'
  | 'peek'
  | 'saveLayout'
> {
  return {
    saveLayout: async () => Promise.resolve(),
    navigate: async (tab, { start, column }) => openLink(tables, uri, { tab, start, column }),
    openReference: async (tab, { start, reference }) =>
      openReference(tables, uri, { tab, start, reference }),
    countReferences: async (tab, row) => countReferences(tables, uri, { tab, row }),
    peek: async (tab, { row, column }) => peekLink(tables, uri, { tab, row, column }),
    goToStep: async (step) => goToStep(tables, uri, step),
    allowWrites: async () => allowWrites(tables, uri),
    openInEditor: async (tab) => openTableInEditor(tables, uri, tab),
  }
}

// Allowing writes is a change of the connection of its own, confirmed as from anywhere else.
async function allowWrites(tables: NavigationContext, uri: vscode.Uri): Promise<void> {
  const connectionId = tables.connectionOf(uri)
  if (connectionId !== undefined) {
    await vscode.commands.executeCommand(CommandId.AllowWrites, connectionId)
  }
}
