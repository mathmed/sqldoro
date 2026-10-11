import type * as vscode from 'vscode'

import { crumbsOf } from '../../core/navigation/history.ts'
import type { EditorSessions } from '../editor/editor-sessions.ts'
import type { PeekCache } from '../navigation/peek.ts'
import type { ResultsPanels } from '../results/results-panels.ts'
import { ConnectionStatus, type SessionManager } from '../sessions/session-manager.ts'
import type { ConnectionStore } from '../storage/connection-store.ts'
import { CloseReason, type EditorTransactions } from '../transactions/editor-transactions.ts'
import type { TableNavigations } from './table-navigations.ts'
import { isTableKey, type TableTarget, tableTargetOf } from './table-uri.ts'

export interface TablePanelsContext {
  readonly panels: ResultsPanels
  readonly editorSessions: EditorSessions
  readonly transactions: EditorTransactions
  readonly sessions: SessionManager
  readonly store: Pick<ConnectionStore, 'list' | 'onDidChange'>
  readonly navigations: TableNavigations
  readonly peeks: PeekCache
}

// A table panel is the source of its rows, as an editor is of its results: closing it gives back
// its session and forgets its trail, and closing or deleting its connection closes it. Its view
// shows its trail as it changes.
export function followTablePanels(context: TablePanelsContext): vscode.Disposable[] {
  const { panels, sessions, store, navigations } = context
  return [
    panels.onDidClose((uri) => {
      navigations.forget(uri)
      context.peeks.forget(uri)
      void releaseTable(context, uri.toString())
    }),
    navigations.onDidChange(({ uri, navigation }) => {
      panels.get(uri)?.showTrail(crumbsOf(navigation))
    }),
    sessions.onDidChange((connectionId) => {
      if (sessions.state(connectionId).status === ConnectionStatus.Disconnected) {
        closeTables(panels, (target) => target.connectionId === connectionId)
      }
    }),
    store.onDidChange(() => {
      const ids = new Set(store.list().map(({ id }) => id))
      closeTables(panels, (target) => !ids.has(target.connectionId))
    }),
  ]
}

// The session of an editor goes when its document closes; the session of a table, with its panel.
async function releaseTable(context: TablePanelsContext, key: string): Promise<void> {
  if (isTableKey(key)) {
    await context.editorSessions.release(key, CloseReason.EditorClosed)
    context.transactions.forget(key)
  }
}

function closeTables(panels: ResultsPanels, isClosing: (target: TableTarget) => boolean): void {
  panels.closeWhere((uri) => {
    const target = tableTargetOf(uri)
    return target !== undefined && isClosing(target)
  })
}
