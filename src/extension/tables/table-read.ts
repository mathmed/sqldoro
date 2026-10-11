import * as vscode from 'vscode'

import { type TableStep, withCurrent } from '../../core/navigation/history.ts'
import { TabKind } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { namedView } from '../../core/results/server-view.ts'
import { type TableQuery, tableReadQuery } from '../../core/results/table-query.ts'
import { IDENTITY_VIEW, type ViewSpec } from '../../core/results/view.ts'
import type { RunTarget, RunWork } from '../editor/run-types.ts'
import { parameterTypesOf } from '../metadata/parameter-types.ts'
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
// they were.
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
  const { query, view } = await stepQuery(context, target, work.step)
  if ('problem' in query) {
    void vscode.window.showWarningMessage(query.problem)
    return undefined
  }
  const { tab, step, change, shouldAutoLimit } = work
  return {
    statements: [query.sql],
    run: async (parts) => {
      context.navigations.update(target.uri, (navigation) => withCurrent(navigation, change))
      tab.readWith({ sql: query.sql, values: query.values, condition: step.condition })
      tab.restart(view)
      parts.panel.updateTab(tab, true)
      await context.runner.runJob(parts, {
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

interface StepQuery {
  readonly query: TableQuery
  // The view the statement reads the rows in.
  readonly view: ViewSpec
}

// The statement of a step: the catalog tells how its values compare exactly (MySQL compares a
// BIGINT with text as floating-point numbers). A view that names columns the table no longer has
// is left out.
async function stepQuery(
  context: TableContext,
  target: RunTarget,
  step: TableStep,
): Promise<StepQuery> {
  const { dialect } = target.engine
  const parameterTypes = await parameterTypesOf(context, target, step.table)
  const columns = step.columns.map((name) => ({ name }))
  const named = namedView(step.view, { columns, parameterTypes })
  return {
    query: tableReadQuery({ ...step, view: named ?? NO_VIEW, parameterTypes }, dialect),
    view: named === undefined ? IDENTITY_VIEW : step.view,
  }
}
