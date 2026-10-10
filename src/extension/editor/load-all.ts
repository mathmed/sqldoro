import type * as vscode from 'vscode'

import { TabKind } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { IDENTITY_VIEW } from '../../core/results/view.ts'
import type { QueryRunner } from './query-runner.ts'
import type { RunWork } from './run-types.ts'
import { openDocument, runServerView } from './server-view.ts'

// Runs the query of a tab again without its automatic limit (the row limit of the settings still
// applies), through the guards like any run; a view sorted on the server keeps its sort and filters.
export async function loadAllRows(
  runner: QueryRunner,
  uri: vscode.Uri,
  tab: ResultSet,
): Promise<void> {
  if (tab.isServerView) {
    await runServerView(runner, uri, { tab, view: tab.view, shouldAutoLimit: false })
    return
  }
  const document = openDocument(uri)
  if (document !== undefined) {
    await runner.perform(document, async () => Promise.resolve(loadAllWork(runner, tab)))
  }
}

function loadAllWork(runner: QueryRunner, tab: ResultSet): RunWork {
  return {
    statements: [tab.sql],
    run: async (parts) => {
      tab.restart(IDENTITY_VIEW)
      parts.panel.updateTab(tab, true)
      await runner.runJob(parts, {
        sql: tab.sql,
        values: [],
        place: undefined,
        isRecorded: false,
        kind: TabKind.Rows,
        tab,
        shouldAutoLimit: false,
      })
    },
  }
}
