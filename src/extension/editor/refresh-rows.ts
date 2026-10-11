import type { Dialect } from '../../core/engine/dialect.ts'
import type { QueryValue } from '../../core/engine/query.ts'
import { TabKind } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { serverViewQuery } from '../../core/results/server-view.ts'
import { IDENTITY_VIEW, isIdentityView } from '../../core/results/view.ts'
import type { QueryRunner } from './query-runner.ts'
import type { RunParts } from './run-types.ts'

// What reads the rows of a tab again: its query, or its view on the server, and whether it gets the
// automatic limit.
export interface Refresh {
  readonly sql: string
  readonly values: readonly QueryValue[]
  readonly isServerView: boolean
  readonly shouldAutoLimit: boolean
}

interface Refreshing {
  readonly tab: ResultSet
  readonly refresh: Refresh
}

// The query of the tab again, limited as it was. A view sorted or filtered on the server runs again
// as such, around the query; the statement of a table panel holds its view already, and its bound
// values.
export function refreshOf(tab: ResultSet, dialect: Dialect): Refresh {
  const shouldAutoLimit = wasLimited(tab)
  if (tab.canRefresh) {
    return { sql: tab.sql, values: tab.values, isServerView: tab.isServerView, shouldAutoLimit }
  }
  const server = tab.isServerView
    ? serverViewQuery(tab.sql, tab.view, {
        columns: tab.columns,
        dialect,
        parameterTypes: tab.parameterTypes,
      })
    : undefined
  return server === undefined
    ? { sql: tab.sql, values: [], isServerView: false, shouldAutoLimit }
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
export function wasLimited(tab: ResultSet): boolean {
  return tab.toTab().summary?.autoLimit !== null
}
