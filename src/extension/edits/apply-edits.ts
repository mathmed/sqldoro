import * as vscode from 'vscode'

import { deletionConfirmation } from '../../core/edits/confirm-deletions.ts'
import type { EditPlan } from '../../core/edits/plan.ts'
import type { ApplyReport } from '../../core/edits/tab-editor.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import type { QueryValue } from '../../core/engine/query.ts'
import { TabKind } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { serverViewQuery } from '../../core/results/server-view.ts'
import { IDENTITY_VIEW, isIdentityView } from '../../core/results/view.ts'
import { type GuardPolicy, isProduction } from '../../core/safety/guard.ts'
import type { QueryRunner } from '../editor/query-runner.ts'
import type { RunParts, RunTarget, RunWork } from '../editor/run-types.ts'
import { openDocument } from '../editor/server-view.ts'
import { askTyped } from '../safety/typed-confirmation.ts'
import { type BatchContext, notApplied, runBatch } from './edit-batch.ts'

export interface ApplyContext extends BatchContext {
  readonly runner: QueryRunner
  readonly policy: () => GuardPolicy
}

export interface ApplyRequest {
  readonly tab: ResultSet
  readonly plan: EditPlan
}

// What reads the rows of the tab again once the changes applied: its query, or its view on the
// server.
interface Refresh {
  readonly sql: string
  readonly values: readonly QueryValue[]
  readonly isServerView: boolean
}

const NOT_RUN = notApplied('the changes did not run.')
const NOT_CONFIRMED = notApplied('the deletion was not confirmed.')

// The statements of the changes run like any other run of the editor: the guards see them first
// (with the query that reads the rows again), then they run on the editor's session, all or none.
export async function applyEdits(
  context: ApplyContext,
  uri: vscode.Uri,
  request: ApplyRequest,
): Promise<void> {
  let report = NOT_RUN
  try {
    const document = openDocument(uri)
    if (document !== undefined) {
      await context.runner.perform(document, async (target) =>
        Promise.resolve(
          applyWork(context, target, {
            ...request,
            onReport: (outcome) => {
              report = outcome
            },
          }),
        ),
      )
    }
  } finally {
    request.tab.editor.finish(report)
  }
}

interface Work extends ApplyRequest {
  readonly onReport: (report: ApplyReport) => void
}

function applyWork(context: ApplyContext, target: RunTarget, work: Work): RunWork {
  const refresh = refreshOf(work.tab, target.engine.dialect)
  return {
    statements: [...work.plan.statements.map(({ sql }) => sql), refresh.sql],
    run: async (parts) => {
      if (!(await confirmDeletions(context, parts, work.plan))) {
        work.onReport(NOT_CONFIRMED)
        return
      }
      const report = await runBatch(context, parts, work.plan)
      work.onReport(report)
      await afterApply(context, parts, { ...work, refresh, report })
    },
  }
}

// A view sorted or filtered on the server runs again as such; any other runs as the query.
function refreshOf(tab: ResultSet, dialect: Dialect): Refresh {
  const server = tab.isServerView
    ? serverViewQuery(tab.sql, tab.view, { columns: tab.columns, dialect })
    : undefined
  return server === undefined
    ? { sql: tab.sql, values: [], isServerView: false }
    : { ...server, isServerView: true }
}

async function confirmDeletions(
  context: ApplyContext,
  { target }: RunParts,
  plan: EditPlan,
): Promise<boolean> {
  const confirmation = deletionConfirmation(plan.deletions, {
    table: plan.table,
    connection: target.connection.name,
    isProduction: isProduction(target.connection.environment, context.policy()),
  })
  if (confirmation === undefined || confirmation.isTyped) {
    return confirmation === undefined || askTyped(confirmation)
  }
  const choice = await vscode.window.showWarningMessage(
    `${confirmation.title}?`,
    { modal: true, detail: confirmation.prompt },
    confirmation.expected,
  )
  return choice === confirmation.expected
}

interface Applied extends ApplyRequest {
  readonly refresh: Refresh
  readonly report: ApplyReport
}

// The tab hears the outcome; once the changes applied, it reads its rows again (on the same
// session: the changes are there even while their transaction is open) and keeps its view.
async function afterApply(context: ApplyContext, parts: RunParts, applied: Applied): Promise<void> {
  const { tab, report } = applied
  tab.editor.finish(report)
  parts.panel.updateTab(tab, true)
  if (!report.isApplied) {
    void vscode.window.showErrorMessage(report.message)
    return
  }
  void vscode.window.showInformationMessage(report.message)
  await refreshRows(context.runner, parts, applied)
  tab.editor.notify(report.message, false)
  parts.panel.updateTab(tab, true)
}

async function refreshRows(
  runner: QueryRunner,
  parts: RunParts,
  { tab, refresh }: Applied,
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

// Rows read with the automatic limit are read again with it; all rows, all rows again.
function wasLimited(tab: ResultSet): boolean {
  return (tab.toTab().summary?.autoLimit ?? null) !== null
}
