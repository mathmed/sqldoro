import * as vscode from 'vscode'

import type { ObjectScope } from '../../core/engine/catalog.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import { QueryError } from '../../core/engine/query-error.ts'
import {
  QueryCancelledError,
  type QueryExecution,
  type QueryRequest,
  type QueryResult,
  type QueryValue,
} from '../../core/engine/query.ts'
import { type HistoryEntry, RunOutcome } from '../../core/history/history.ts'
import { locateError } from '../../core/results/error-location.ts'
import { planLines } from '../../core/results/plan.ts'
import { TabKind } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import type { LimitPlan } from '../../core/safety/auto-limit.ts'
import { redactSqlSecrets } from '../../core/sql/redact-sql.ts'
import { describeError } from '../../core/text/errors.ts'
import type { Clock } from '../platform/clock.ts'
import type { ResultsPanel } from '../results/results-panel.ts'

// Everything a statement needs to run in an editor and show its result.
export interface StatementContext {
  readonly document: vscode.TextDocument
  readonly connectionId: string
  readonly scope: ObjectScope
  readonly dialect: Dialect
  readonly execute: (request: QueryRequest) => QueryExecution
  readonly panel: ResultsPanel
  readonly diagnostics: vscode.DiagnosticCollection
  readonly clock: Clock
  readonly createId: () => string
  readonly record: (entry: HistoryEntry) => void
  readonly onExecution: (execution: QueryExecution) => void
}

// Where a statement is in its editor: errors are shown there. `prefixLength` is what the text
// that runs adds before the statement as written (EXPLAIN ...).
interface StatementPlace {
  readonly offset: number
  readonly prefixLength: number
}

// One statement: its text, the tab it fills, where it is in the editor (unknown for a statement
// sqldoro wrote, such as a sort on the server), whether the history keeps it, and what runs for it
// (the text with its automatic LIMIT) with how many rows are kept.
export interface StatementJob {
  readonly sql: string
  readonly values: readonly QueryValue[]
  readonly place: StatementPlace | undefined
  readonly isRecorded: boolean
  readonly tab: ResultSet
  readonly kind: TabKind
  readonly limit: LimitPlan
}

const DIAGNOSTIC_SOURCE = 'sqldoro'

// Runs the statement into its tab, and says how it ended.
export async function runStatement(
  context: StatementContext,
  job: StatementJob,
): Promise<RunOutcome> {
  const { tab, panel } = { tab: job.tab, panel: context.panel }
  const startedAt = context.clock.timestamp()
  const started = context.clock.now()
  const execution = context.execute({
    sql: job.limit.sql,
    maxRows: job.limit.maxRows,
    values: job.values,
    onColumns: (columns) => {
      tab.describe(columns)
      panel.updateTab(tab, true)
    },
    onRows: (rows) => {
      tab.addRows(rows)
      panel.updateTab(tab, false)
    },
  })
  context.onExecution(execution)
  const outcome = await settle(context, job, { execution, started })
  panel.updateTab(tab, true)
  record(context, job, { outcome, startedAt, durationMs: context.clock.now() - started })
  return outcome.status
}

interface Settled {
  readonly status: RunOutcome
  readonly rowCount: number | null
  readonly message: string
}

async function settle(
  context: StatementContext,
  job: StatementJob,
  { execution, started }: { readonly execution: QueryExecution; readonly started: number },
): Promise<Settled> {
  try {
    const result = await execution.result
    return succeeded(job, result, context.clock.now() - started)
  } catch (error) {
    if (error instanceof QueryCancelledError) {
      job.tab.cancel(context.clock.now() - started)
      return { status: RunOutcome.Cancelled, rowCount: null, message: '' }
    }
    return failed(context, job, error)
  }
}

function succeeded(job: StatementJob, result: QueryResult, durationMs: number): Settled {
  const affectedRows = result.affectedRows ?? null
  const plan = job.kind === TabKind.Plan ? planLines(result) : []
  const { isTruncated } = result
  job.tab.succeed({ durationMs, affectedRows, isTruncated, autoLimit: job.limit.autoLimit }, plan)
  return { status: RunOutcome.Succeeded, rowCount: affectedRows ?? result.rows.length, message: '' }
}

// The server's message goes to the tab and, where it points, to the editor.
function failed(context: StatementContext, job: StatementJob, error: unknown): Settled {
  const message = describeError(error)
  const range =
    job.place === undefined
      ? undefined
      : errorRange(context.document, { sql: job.sql, place: job.place }, error)
  if (range !== undefined) {
    showDiagnostic(context, range, message)
  }
  job.tab.fail({ message, ...positionOf(error instanceof QueryError ? range : undefined) })
  return { status: RunOutcome.Failed, rowCount: null, message }
}

function showDiagnostic(context: StatementContext, range: vscode.Range, message: string): void {
  const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error)
  diagnostic.source = DIAGNOSTIC_SOURCE
  context.diagnostics.set(context.document.uri, [diagnostic])
}

// 1-based, as editors show them.
function positionOf(range: vscode.Range | undefined): {
  line: number | null
  column: number | null
} {
  return range === undefined
    ? { line: null, column: null }
    : { line: range.start.line + 1, column: range.start.character + 1 }
}

// Where the server located the error, or the whole statement when it did not say. The range stays
// inside the statement as written.
function errorRange(
  document: vscode.TextDocument,
  { sql, place }: { readonly sql: string; readonly place: StatementPlace },
  error: unknown,
): vscode.Range {
  const { offset, prefixLength } = place
  const { start, end } =
    error instanceof QueryError
      ? locateError(error.location, sql)
      : { start: prefixLength, end: sql.length }
  const inStatement = (at: number): number =>
    offset + Math.min(Math.max(at - prefixLength, 0), sql.length - prefixLength)
  return new vscode.Range(
    document.positionAt(inStatement(start)),
    document.positionAt(inStatement(end)),
  )
}

interface Recorded {
  readonly outcome: Settled
  readonly startedAt: string
  readonly durationMs: number
}

function record(context: StatementContext, job: StatementJob, recorded: Recorded): void {
  if (!job.isRecorded) {
    return
  }
  context.record({
    id: context.createId(),
    connectionId: context.connectionId,
    sql: redactSqlSecrets(job.sql, context.dialect.lexical),
    database: context.scope.database,
    schema: context.scope.schema,
    startedAt: recorded.startedAt,
    durationMs: recorded.durationMs,
    outcome: recorded.outcome.status,
    rowCount: recorded.outcome.rowCount,
    message: recorded.outcome.message,
  })
}
