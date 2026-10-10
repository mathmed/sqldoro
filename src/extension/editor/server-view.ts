import * as vscode from 'vscode'

import { TabKind } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { serverViewProblem, serverViewQuery } from '../../core/results/server-view.ts'
import type { ViewSpec } from '../../core/results/view.ts'
import type { QueryRunner, RunTarget, RunWork } from './query-runner.ts'

export interface ServerViewRequest {
  readonly tab: ResultSet
  readonly view: ViewSpec
}

const DUPLICATE_COLUMNS =
  'Columns with the same name cannot be sorted or filtered on the server: sort and filter the rows here instead.'

// Sorts and filters the whole result on the server: the query of the tab runs again, wrapped, on
// the editor's connection, and its rows replace the tab's.
export async function runServerView(
  runner: QueryRunner,
  uri: vscode.Uri,
  request: ServerViewRequest,
): Promise<void> {
  const document = vscode.workspace.textDocuments.find(
    (open) => open.uri.toString() === uri.toString(),
  )
  if (document === undefined) {
    void vscode.window.showInformationMessage(
      'The editor of this result is closed: run the query again.',
    )
    return
  }
  await runner.perform(document, async (target) =>
    Promise.resolve(serverViewWork(runner, target, request)),
  )
}

function serverViewWork(
  runner: QueryRunner,
  target: RunTarget,
  { tab, view }: ServerViewRequest,
): RunWork | undefined {
  const dialect = target.engine.dialect
  const query = serverViewQuery(tab.sql, view, { columns: tab.columns, dialect })
  if (query === undefined) {
    void vscode.window.showWarningMessage(serverViewProblem(tab.sql, dialect) ?? DUPLICATE_COLUMNS)
    return undefined
  }
  return async (parts) => {
    tab.restart(view)
    parts.panel.updateTab(tab, true)
    await runner.runJob(parts, {
      ...query,
      place: undefined,
      isRecorded: false,
      kind: TabKind.Rows,
      tab,
    })
  }
}
