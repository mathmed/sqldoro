import * as vscode from 'vscode'

import type { ObjectRef } from '../../core/engine/catalog.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { tableFilterQuery } from '../../core/results/table-data.ts'
import type { QueryRunner } from '../editor/query-runner.ts'
import { readingOf, refreshRows } from '../editor/refresh-rows.ts'
import type { RunTarget, RunWork } from '../editor/run-types.ts'
import { tableTargetOf } from './table-uri.ts'

export interface TableFilterRequest {
  readonly tab: ResultSet
  // The condition as typed: what goes in the WHERE of the read, or nothing to read every row.
  readonly condition: string
}

interface Filtering extends TableFilterRequest {
  readonly table: ObjectRef
}

// Reads the rows of a table panel again with a condition the user typed (its WHERE), through the
// guards like any run: they classify the condition with the rest, so a function that writes is
// caught, and a read-only connection refuses it. The tab keeps its view and gets the automatic
// limit again, as a new read does; a condition the guards refuse leaves the rows as they were.
export async function filterTable(
  runner: QueryRunner,
  uri: vscode.Uri,
  request: TableFilterRequest,
): Promise<void> {
  const target = tableTargetOf(uri)
  if (target !== undefined) {
    const filtering = { ...request, condition: request.condition.trim(), table: target.table }
    await runner.perform(uri, async (run) => Promise.resolve(filterWork(runner, run, filtering)))
  }
}

function filterWork(
  runner: QueryRunner,
  target: RunTarget,
  { tab, condition, table }: Filtering,
): RunWork | undefined {
  const { dialect } = target.engine
  const query = tableFilterQuery(table, condition, dialect)
  if ('problem' in query) {
    void vscode.window.showWarningMessage(query.problem)
    return undefined
  }
  const refresh = readingOf(tab, { sql: query.sql, shouldAutoLimit: true }, dialect)
  return {
    statements: [refresh.sql],
    run: async (parts) => {
      tab.filterTable(query.sql, condition)
      await refreshRows(runner, parts, { tab, refresh })
    },
  }
}
