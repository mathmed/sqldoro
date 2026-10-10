import type * as vscode from 'vscode'

import type { Dialect } from '../../core/engine/dialect.ts'
import type { QueryValue } from '../../core/engine/query.ts'
import { TabKind } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { serverViewQuery } from '../../core/results/server-view.ts'
import { IDENTITY_VIEW, isIdentityView } from '../../core/results/view.ts'
import type { QueryRunner } from './query-runner.ts'
import type { RunParts } from './run-types.ts'
import { isSourceOpen } from './server-view.ts'

// What reads the rows of a tab again: its query, or its view on the server.
export interface Refresh {
  readonly sql: string
  readonly values: readonly QueryValue[]
  readonly isServerView: boolean
}

interface Refreshing {
  readonly tab: ResultSet
  readonly refresh: Refresh
}

// Reads the rows of a tab again, through the guards like any run, on the session of its source:
// the view stays as it was, and so does the automatic limit.
export async function refreshTab(
  runner: QueryRunner,
  uri: vscode.Uri,
  tab: ResultSet,
): Promise<void> {
  if (!isSourceOpen(uri)) {
    return
  }
  await runner.perform(uri, async (target) => {
    const refresh = refreshOf(tab, target.engine.dialect)
    return Promise.resolve({
      statements: [refresh.sql],
      run: async (parts: RunParts) => refreshRows(runner, parts, { tab, refresh }),
    })
  })
}

// A view sorted or filtered on the server runs again as such; any other runs as the query.
export function refreshOf(tab: ResultSet, dialect: Dialect): Refresh {
  const server = tab.isServerView
    ? serverViewQuery(tab.sql, tab.view, { columns: tab.columns, dialect })
    : undefined
  return server === undefined
    ? { sql: tab.sql, values: [], isServerView: false }
    : { ...server, isServerView: true }
}

// The rows come again into the same tab, which keeps its view: the server sorts and filters a view
// of its own, the rows already here take back any other.
export async function refreshRows(
  runner: QueryRunner,
  parts: RunParts,
  { tab, refresh }: Refreshing,
): Promise<void> {
  const { view } = tab
  const shouldAutoLimit = wasLimited(tab)
  tab.restart(refresh.isServerView ? view : IDENTITY_VIEW)
  parts.panel.updateTab(tab, true)
  await runner.runJob(parts, {
    sql: refresh.sql,
    values: refresh.values,
    place: undefined,
    isRecorded: false,
    kind: TabKind.Rows,
    tab,
    shouldAutoLimit,
  })
  if (!refresh.isServerView && !isIdentityView(view)) {
    tab.applyView(view)
    parts.panel.updateTab(tab, true)
  }
}

// Rows read with the automatic limit, or not read yet (no summary), are read with it; all rows, all
// rows again.
function wasLimited(tab: ResultSet): boolean {
  return tab.toTab().summary?.autoLimit !== null
}
