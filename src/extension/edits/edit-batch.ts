import {
  BatchMode,
  batchMode,
  type BatchSteps,
  batchSteps,
  FAILED_TRANSACTION,
} from '../../core/edits/batch.ts'
import {
  applyReport,
  isStopping,
  outcomeOfError,
  outcomeOfRows,
  type StatementOutcome,
  type StatementRecord,
} from '../../core/edits/outcome.ts'
import type { EditPlan } from '../../core/edits/plan.ts'
import type { EditStatement } from '../../core/edits/statements.ts'
import type { ApplyReport } from '../../core/edits/tab-editor.ts'
import type { EngineSession, RestoreSession } from '../../core/engine/engine.ts'
import { QueryCancelledError } from '../../core/engine/query.ts'
import type { Logger } from '../../core/platform.ts'
import { plural } from '../../core/results/tabs.ts'
import { StatementCategory } from '../../core/safety/statement-class.ts'
import { describeError } from '../../core/text/errors.ts'
import { transactionScope } from '../editor/run-job.ts'
import type { RunParts } from '../editor/run-types.ts'
import type { EditorTransactions } from '../transactions/editor-transactions.ts'

export interface BatchContext {
  readonly transactions: EditorTransactions
  readonly log: Logger
  // Closes the session of an editor: when a rollback fails, the server rolls back as it closes.
  readonly closeSession: (uri: string) => Promise<void>
}

interface Batch {
  readonly plan: EditPlan
  readonly mode: BatchMode
}

const CANCELLED = 'The apply was cancelled.'
const NOT_ROLLED_BACK =
  'sqldoro could not roll them back, so it closed the connection of this editor: the server rolled them back.'
const NOT_STRICT = 'the session could not be put in strict mode'

function ignore(): void {
  // The statements of the changes return no rows.
}

export function notApplied(reason: string): ApplyReport {
  return { isApplied: false, message: `Nothing was applied: ${reason}`, problems: [] }
}

// Runs the statements of the changes the guards approved, all or none: in a transaction of their
// own, or in a savepoint of the transaction open in the editor. Each must change the rows it
// expects; a row that changed meanwhile is a conflict, and every conflict is found before the
// rollback.
export async function runBatch(
  context: BatchContext,
  parts: RunParts,
  plan: EditPlan,
): Promise<ApplyReport> {
  for (const statement of plan.statements) {
    parts.approval.classOf(statement.sql)
  }
  const mode = batchMode(context.transactions.of(transactionScope(parts).uri))
  if (mode === undefined) {
    return notApplied(FAILED_TRANSACTION)
  }
  const report = await strictly(context, parts, async (batch) =>
    mode === BatchMode.Joined
      ? joined(batch, parts, plan)
      : inTransaction(batch, parts, { plan, mode }),
  )
  logReport(context.log, parts, { plan, report })
  return report
}

// The session refuses the values its columns cannot hold while the changes run (MySQL outside
// strict mode would cut them), then gets back the settings the user's statements run with,
// whatever became of the changes. A session the batch had to close has nothing to put back.
async function strictly(
  context: BatchContext,
  parts: RunParts,
  batch: (context: BatchContext) => Promise<ApplyReport>,
): Promise<ApplyReport> {
  const restore = await parts.session.engineSession
    .startStrictWrites()
    .catch((error: unknown) => notApplied(`${NOT_STRICT}: ${describeError(error)}`))
  if (typeof restore !== 'function') {
    return restore
  }
  const closing = closingOf(context)
  const report = await batch(closing.context).catch(async (error: unknown) => {
    await restoreSession(context, restore)
    throw error
  })
  const failure = closing.isClosed() ? undefined : await restoreSession(context, restore)
  return failure === undefined ? report : { ...report, message: `${report.message} ${failure}` }
}

// The context of a batch, which tells whether the batch closed the session.
function closingOf(context: BatchContext): {
  readonly context: BatchContext
  readonly isClosed: () => boolean
} {
  const closed = { isClosed: false }
  return {
    context: {
      ...context,
      closeSession: async (uri) => {
        closed.isClosed = true
        await context.closeSession(uri)
      },
    },
    isClosed: () => closed.isClosed,
  }
}

// What the user needs to hear when the session could not be put back: its statements would run in
// strict mode, which the user did not choose. Undefined once it is back.
async function restoreSession(
  context: BatchContext,
  restore: RestoreSession,
): Promise<string | undefined> {
  const failure = await failureOf(restore())
  if (failure === undefined) {
    return undefined
  }
  const reason = describeError(failure)
  context.log.error(`Could not turn strict mode off again after the edits of a result: ${reason}`)
  return `sqldoro could not turn strict mode off again in the session of this editor (${reason}): it stays on until the connection is disconnected.`
}

// The transaction of the editor opens first in manual mode, and hears what became of the changes.
async function joined(
  context: BatchContext,
  parts: RunParts,
  plan: EditPlan,
): Promise<ApplyReport> {
  const scope = transactionScope(parts)
  await context.transactions.beforeStatement(scope)
  const report = await inTransaction(context, parts, { plan, mode: BatchMode.Joined })
  await context.transactions.afterStatement(scope, {
    category: StatementCategory.Write,
    isSucceeded: report.isApplied,
  })
  return report
}

async function inTransaction(
  context: BatchContext,
  parts: RunParts,
  { plan, mode }: Batch,
): Promise<ApplyReport> {
  const steps = batchSteps(mode)
  await runAll(parts.session.engineSession, steps.begin)
  const records = await runStatements(parts, plan.statements)
  const report = applyReport(records, { plan, isInOpenTransaction: mode === BatchMode.Joined })
  return settle(context, parts, { steps, report })
}

async function runStatements(
  parts: RunParts,
  statements: readonly EditStatement[],
): Promise<StatementRecord[]> {
  const records: StatementRecord[] = []
  for (const statement of statements) {
    const outcome = await runStatement(parts, statement)
    records.push({ statement, outcome })
    if (isStopping(outcome) || parts.run.isCancelled) {
      break
    }
  }
  return records
}

async function runStatement(parts: RunParts, statement: EditStatement): Promise<StatementOutcome> {
  const execution = parts.session.engineSession.execute({
    sql: statement.sql,
    values: statement.values,
    maxRows: 0,
    onColumns: ignore,
    onRows: ignore,
  })
  parts.run.track(execution)
  try {
    const result = await execution.result
    return outcomeOfRows(statement, result.affectedRows)
  } catch (error) {
    const isCancelled = error instanceof QueryCancelledError
    return outcomeOfError(statement, isCancelled ? CANCELLED : describeError(error))
  }
}

interface Settling {
  readonly steps: BatchSteps
  readonly report: ApplyReport
}

// Commits what applied; a commit that fails, and any refusal, roll back. A rollback that fails
// leaves no transaction behind: the session closes.
async function settle(
  context: BatchContext,
  parts: RunParts,
  settling: Settling,
): Promise<ApplyReport> {
  const session = parts.session.engineSession
  const committed = settling.report.isApplied
    ? await failureOf(runAll(session, settling.steps.commit))
    : false
  if (committed === undefined) {
    return settling.report
  }
  const report =
    committed === false
      ? settling.report
      : notApplied(`the commit failed: ${describeError(committed)}`)
  const rollback = await failureOf(runAll(session, settling.steps.rollback))
  if (rollback === undefined) {
    return report
  }
  context.log.error(`Could not roll back the changes of a result: ${describeError(rollback)}`)
  await context.closeSession(transactionScope(parts).uri)
  return { ...report, message: `${report.message} ${NOT_ROLLED_BACK}` }
}

async function failureOf(work: Promise<void>): Promise<unknown> {
  return work.then(
    () => undefined,
    (error: unknown) => error,
  )
}

async function runAll(session: EngineSession, statements: readonly string[]): Promise<void> {
  for (const sql of statements) {
    await session.execute({ sql, values: [], maxRows: 0, onColumns: ignore, onRows: ignore }).result
  }
}

interface Logged {
  readonly plan: EditPlan
  readonly report: ApplyReport
}

// The log names the connection, the table and what was done: never values.
function logReport(log: Logger, parts: RunParts, { plan, report }: Logged): void {
  const where = `Edits on "${parts.target.connection.name}"`
  if (report.isApplied) {
    log.info(`${where}: applied ${plan.summary}`)
    return
  }
  const refused = plural(report.problems.length, 'row', 'rows')
  log.warn(`${where}: nothing applied to ${plan.table} (${refused} refused)`)
}
