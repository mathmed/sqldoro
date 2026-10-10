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

// What reads the rows of a tab again: its query, or its view on the server, and whether it gets the
// automatic limit.
export interface Refresh {
  readonly sql: string
  readonly values: readonly QueryValue[]
  readonly isServerView: boolean
  readonly shouldAutoLimit: boolean
}

// A query to read the rows of a tab with, and whether it gets the automatic limit.
export interface Reading {
  readonly sql: string
  readonly shouldAutoLimit: boolean
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

// The query of the tab again, limited as it was.
export function refreshOf(tab: ResultSet, dialect: Dialect): Refresh {
  return readingOf(tab, { sql: tab.sql, shouldAutoLimit: wasLimited(tab) }, dialect)
}

// The rows of a tab read with a query, in the view of the tab: a view sorted or filtered on the
// server runs again as such, around the query; any other runs as the query.
export function readingOf(tab: ResultSet, reading: Reading, dialect: Dialect): Refresh {
  const { sql, shouldAutoLimit } = reading
  const server = tab.isServerView
    ? serverViewQuery(sql, tab.view, { columns: tab.columns, dialect })
    : undefined
  return server === undefined
    ? { sql, values: [], isServerView: false, shouldAutoLimit }
    : { ...server, isServerView: true, shouldAutoLimit }
}

// The rows come again into the same tab, which keeps its view: the server sorts and filters a view
// of its own, the rows already here take back any other.
export async function refreshRows(
  runner: QueryRunner,
  parts: RunParts,
  { tab, refresh }: Refreshing,
): Promise<void> {
  const { view } = tab
  tab.restart(refresh.isServerView ? view : IDENTITY_VIEW)
  parts.panel.updateTab(tab, true)
  await runner.runJob(parts, {
    sql: refresh.sql,
    values: refresh.values,
    place: undefined,
    isRecorded: false,
    kind: TabKind.Rows,
    tab,
    shouldAutoLimit: refresh.shouldAutoLimit,
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
