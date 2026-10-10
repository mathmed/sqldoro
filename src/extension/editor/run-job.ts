import * as vscode from 'vscode'

import { RunOutcome } from '../../core/history/history.ts'
import type { HistoryEntry } from '../../core/history/history.ts'
import type { Logger } from '../../core/platform.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { planLimit } from '../../core/safety/auto-limit.ts'
import { describeError } from '../../core/text/errors.ts'
import type { Clock } from '../platform/clock.ts'
import type { Settings } from '../settings.ts'
import type { EditorTransactions, TransactionScope } from '../transactions/editor-transactions.ts'
import { documentLabel } from './document-label.ts'
import type { RunParts } from './run-types.ts'
import { runStatement, type StatementContext, type StatementJob } from './statement-run.ts'

// A statement for a tab: a new tab unless one is given, and whether a query without a limit of
// its own gets the automatic one.
export interface JobRequest extends Omit<StatementJob, 'limit' | 'tab'> {
  readonly tab?: ResultSet
  readonly shouldAutoLimit: boolean
}

export interface JobContext {
  readonly parts: RunParts
  readonly transactions: EditorTransactions
  readonly settings: () => Settings
  readonly diagnostics: vscode.DiagnosticCollection
  readonly clock: Clock
  readonly createId: () => string
  readonly record: (entry: HistoryEntry) => Promise<void>
  readonly log: Logger
}

// Runs a statement the guards approved: the approval says what it does, which decides its
// automatic limit; in manual mode it opens the transaction first, and what the server then says of
// the transaction is noted in the tab when nobody asked for it.
export async function runApprovedJob(
  context: JobContext,
  job: JobRequest & { readonly tab: ResultSet },
): Promise<boolean> {
  const { parts, settings, transactions } = context
  const statement = parts.approval.classOf(job.sql)
  const { autoLimit, maxRows } = settings()
  const limit = planLimit(job.sql, statement, {
    autoLimit: job.shouldAutoLimit ? autoLimit : null,
    maxRows,
    rules: parts.target.engine.dialect.lexical,
  })
  const scope = transactionScope(parts)
  await transactions.beforeStatement(scope)
  const outcome = await runStatement(statementContext(context), { ...job, limit })
  const isSucceeded = outcome === RunOutcome.Succeeded
  const notice = await transactions.afterStatement(scope, {
    category: statement.category,
    isSucceeded,
  })
  if (notice !== undefined) {
    job.tab.addNotice(notice)
    parts.panel.updateTab(job.tab, true)
    void vscode.window.showWarningMessage(notice)
  }
  return isSucceeded
}

function transactionScope({
  target,
  session,
}: Pick<RunParts, 'session' | 'target'>): TransactionScope {
  return {
    uri: target.document.uri.toString(),
    session: session.engineSession,
    place: `"${documentLabel(target.document.uri)}" on "${target.connection.name}"`,
    isReadOnly: target.connection.isReadOnly,
  }
}

function statementContext(context: JobContext): StatementContext {
  const { parts, diagnostics, clock, createId, log } = context
  return {
    document: parts.target.document,
    connectionId: parts.target.connection.id,
    scope: parts.target.scope,
    dialect: parts.target.engine.dialect,
    execute: (request) => parts.session.engineSession.execute(request),
    panel: parts.panel,
    diagnostics,
    clock,
    createId,
    record: (entry) => {
      context.record(entry).catch((error: unknown) => {
        log.warn(`Could not keep the statement in the history: ${describeError(error)}`)
      })
    },
    onExecution: (execution) => {
      parts.run.track(execution)
    },
  }
}
