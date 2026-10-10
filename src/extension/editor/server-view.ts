import * as vscode from 'vscode'

import { TabKind } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { serverViewProblem, serverViewQuery } from '../../core/results/server-view.ts'
import type { ViewSpec } from '../../core/results/view.ts'
import { isTableKey } from '../tables/table-uri.ts'
import type { QueryRunner } from './query-runner.ts'
import type { RunTarget, RunWork } from './run-types.ts'

export interface ServerViewRequest {
  readonly tab: ResultSet
  readonly view: ViewSpec
  // Whether the query gets the automatic limit: not when the user asked for every row.
  readonly shouldAutoLimit: boolean
}

const DUPLICATE_COLUMNS =
  'Columns with the same name cannot be sorted or filtered on the server: sort and filter the rows here instead.'

// Sorts and filters the whole result on the server: the query of the tab runs again, wrapped, on
// the connection of its source, and its rows replace the tab's.
export async function runServerView(
  runner: QueryRunner,
  uri: vscode.Uri,
  request: ServerViewRequest,
): Promise<void> {
  if (isSourceOpen(uri)) {
    await runner.perform(uri, async (target) =>
      Promise.resolve(serverViewWork(runner, target, request)),
    )
  }
}

// Whether the source of a result is still open: the document of its editor (a table panel is its
// own source); otherwise the user is told to run the query again.
export function isSourceOpen(uri: vscode.Uri): boolean {
  const key = uri.toString()
  const isOpen =
    isTableKey(key) || vscode.workspace.textDocuments.some((open) => open.uri.toString() === key)
  if (!isOpen) {
    void vscode.window.showInformationMessage(
      'The editor of this result is closed: run the query again.',
    )
  }
  return isOpen
}

function serverViewWork(
  runner: QueryRunner,
  target: RunTarget,
  { tab, view, shouldAutoLimit }: ServerViewRequest,
): RunWork | undefined {
  const dialect = target.engine.dialect
  const query = serverViewQuery(tab.sql, view, { columns: tab.columns, dialect })
  if (query === undefined) {
    void vscode.window.showWarningMessage(serverViewProblem(tab.sql, dialect) ?? DUPLICATE_COLUMNS)
    return undefined
  }
  return {
    statements: [query.sql],
    run: async (parts) => {
      tab.restart(view)
      parts.panel.updateTab(tab, true)
      await runner.runJob(parts, {
        ...query,
        place: undefined,
        isRecorded: false,
        kind: TabKind.Rows,
        tab,
        shouldAutoLimit,
      })
    },
  }
}
