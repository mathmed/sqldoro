import * as vscode from 'vscode'

import { deletionConfirmation } from '../../core/edits/confirm-deletions.ts'
import type { EditPlan } from '../../core/edits/plan.ts'
import type { ApplyReport } from '../../core/edits/tab-editor.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { type GuardPolicy, isProduction } from '../../core/safety/guard.ts'
import type { QueryRunner } from '../editor/query-runner.ts'
import { type Refresh, refreshOf, refreshRows } from '../editor/refresh-rows.ts'
import type { RunParts, RunTarget, RunWork } from '../editor/run-types.ts'
import { isSourceOpen } from '../editor/server-view.ts'
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
    if (isSourceOpen(uri)) {
      await context.runner.perform(uri, async (target) =>
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
