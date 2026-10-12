import * as vscode from 'vscode'

import { isQueryStep, type TableStep, withCurrent } from '../../core/navigation/history.ts'
import { TabKind } from '../../core/results/protocol.ts'
import type { BoxSource } from '../../core/results/query-box.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { namedView, type ServerQuery } from '../../core/results/server-view.ts'
import { type TableQuery, tableReadQuery } from '../../core/results/table-query.ts'
import { IDENTITY_VIEW, type ViewSpec } from '../../core/results/view.ts'
import { isReadOnlyQuery } from '../../core/sql/statement-kind.ts'
import type { RunParts, RunTarget, RunWork } from '../editor/run-types.ts'
import { parameterTypesOf } from '../metadata/parameter-types.ts'
import { offerQueryBox } from './query-box-offer.ts'
import type { TableContext } from './table-context.ts'

// A read of the rows of the step a table panel shows, into a tab: with a change of its WHERE or its
// view, kept once the guards let the read run, and with the automatic limit or not.
export interface StepRead {
  readonly tab: ResultSet
  readonly change: Partial<Pick<TableStep, 'columns' | 'condition' | 'view'>>
  readonly shouldAutoLimit: boolean
}

const NO_VIEW = { filters: [], sort: [] }

// Reads the rows of the step a table panel shows, through the guards like any run: its key and the
// filters of its view are bound values, its WHERE is the user's own SQL, classified with the rest.
// A change the guards refuse (or a WHERE that is not one condition) leaves the step and the rows as
// they were. The step of a query of the query box runs its query again, if it only reads: a query
// that writes runs only when the user runs it.
export async function readStep(
  context: TableContext,
  uri: vscode.Uri,
  read: StepRead,
): Promise<void> {
  const current = context.navigations.current(uri)
  if (current !== undefined) {
    const step = { ...current, ...read.change }
    await context.runner.perform(uri, async (target) =>
      stepWork(context, target, { ...read, step }),
    )
  }
}

interface Work extends StepRead {
  readonly step: TableStep
}

async function stepWork(
  context: TableContext,
  target: RunTarget,
  work: Work,
): Promise<RunWork | undefined> {
  if (!canReadAgain(work.step, target)) {
    return undefined
  }
  const read = await stepQuery(context, target, work.step)
  if ('problem' in read.query) {
    void vscode.window.showWarningMessage(read.query.problem)
    return undefined
  }
  const query = read.query
  return {
    statements: [query.sql],
    run: async (parts) => runStep(context, parts, { work, read: { ...read, query } }),
  }
}

interface Running {
  readonly work: Work
  readonly read: StepQuery & { readonly query: ServerQuery }
}

// Once the guards let it run: the step changes, and the rows of the tab are read again.
async function runStep(context: TableContext, parts: RunParts, running: Running): Promise<void> {
  const { tab, step, change, shouldAutoLimit } = running.work
  const { query, view, box } = running.read
  context.navigations.update(parts.target.uri, (navigation) => withCurrent(navigation, change))
  tab.readWith({ sql: query.sql, values: query.values, condition: step.condition })
  tab.restart(view)
  tab.showInBox(box)
  parts.panel.updateTab(tab, true)
  void offerQueryBox(context, parts, step.table)
  await context.runner.runJob(parts, {
    ...query,
    place: undefined,
    isRecorded: isQueryStep(step),
    kind: TabKind.Rows,
    tab,
    shouldAutoLimit,
  })
}

// The rows of a table, and a query that only reads, are read again as often as asked.
function canReadAgain(step: TableStep, target: RunTarget): boolean {
  return !isQueryStep(step) || isReadOnlyQuery(step.query, target.engine.dialect.lexical)
}

interface StepQuery {
  readonly query: TableQuery
  // The view the statement reads the rows in.
  readonly view: ViewSpec
  // What the query box shows with the rows.
  readonly box: BoxSource
}

// The statement of a step: the catalog tells how its values compare exactly (MySQL compares a
// BIGINT with text as floating-point numbers). A view that names columns the table no longer has
// is left out. The step of a query runs it as the user wrote it.
async function stepQuery(
  context: TableContext,
  target: RunTarget,
  step: TableStep,
): Promise<StepQuery> {
  if (isQueryStep(step)) {
    const query = { sql: step.query, values: [] }
    return { query, view: IDENTITY_VIEW, box: { query: step.query } }
  }
  const { dialect } = target.engine
  const parameterTypes = await parameterTypesOf(context, target, step.table)
  const columns = step.columns.map((name) => ({ name }))
  const named = namedView(step.view, { columns, parameterTypes })
  const { key, condition } = step
  const table = { table: step.table, key, condition, view: named ?? NO_VIEW, parameterTypes }
  return {
    query: tableReadQuery(table, dialect),
    view: named === undefined ? IDENTITY_VIEW : step.view,
    box: { table, dialect },
  }
}
