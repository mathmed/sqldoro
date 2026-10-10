import { plural } from '../results/tabs.ts'
import type { EditPlan } from './plan.ts'
import { type EditStatement, EditVerb } from './statements.ts'
import type { ApplyReport } from './tab-editor.ts'

// What became of a statement of an apply: done; a conflict (it changed no row: the row changed or
// went since the grid read it); or a failure (the server refused it, or it changed another number
// of rows than it had to), which stops the apply.
export const OutcomeKind = {
  Done: 'done',
  Conflict: 'conflict',
  Failed: 'failed',
} as const

export type OutcomeKind = (typeof OutcomeKind)[keyof typeof OutcomeKind]

export interface StatementOutcome {
  readonly kind: OutcomeKind
  // Why it did not apply, for people; empty when it did.
  readonly problem: string
}

export interface StatementRecord {
  readonly statement: EditStatement
  readonly outcome: StatementOutcome
}

const DONE: StatementOutcome = { kind: OutcomeKind.Done, problem: '' }
const CONFLICTS: ReadonlyMap<string, string> = new Map([
  [EditVerb.Update, 'changed or was deleted since sqldoro read it: it was not overwritten.'],
  [EditVerb.Delete, 'changed or was already deleted since sqldoro read it: it was not deleted.'],
])

// The rows a statement changed, as the server counted them.
export function outcomeOfRows(
  statement: EditStatement,
  affectedRows: number | undefined,
): StatementOutcome {
  if (affectedRows === statement.expectedRows) {
    return DONE
  }
  const conflict = affectedRows === 0 ? CONFLICTS.get(statement.verb) : undefined
  if (conflict !== undefined) {
    return { kind: OutcomeKind.Conflict, problem: `${statement.label} ${conflict}` }
  }
  return {
    kind: OutcomeKind.Failed,
    problem:
      affectedRows === undefined
        ? `${statement.label}: the server did not say how many rows it changed.`
        : `${statement.label} would have changed ${plural(affectedRows, 'row', 'rows')} instead of ${String(statement.expectedRows)}.`,
  }
}

// The server refused the statement, with its message.
export function outcomeOfError(statement: EditStatement, message: string): StatementOutcome {
  return { kind: OutcomeKind.Failed, problem: `${statement.label}: ${message}` }
}

// A conflict lets the next statements run, to find every row that changed; a failure stops.
export function isStopping(outcome: StatementOutcome): boolean {
  return outcome.kind === OutcomeKind.Failed
}

// Everything applied, or nothing (it was all rolled back), and what kept each row out.
export function applyReport(
  records: readonly StatementRecord[],
  { plan, isInOpenTransaction }: { readonly plan: EditPlan; readonly isInOpenTransaction: boolean },
): ApplyReport {
  const refused = records.filter(({ outcome }) => outcome.kind !== OutcomeKind.Done)
  const [first] = refused
  if (first === undefined && records.length === plan.statements.length) {
    return { isApplied: true, message: appliedMessage(plan, isInOpenTransaction), problems: [] }
  }
  const reason = first === undefined ? 'the apply stopped before its end.' : first.outcome.problem
  return {
    isApplied: false,
    message: `Nothing was applied: ${reason}${othersText(refused.length - 1)}`,
    problems: refused.map(({ statement, outcome }) => ({
      row: statement.row,
      problem: outcome.problem,
    })),
  }
}

function othersText(others: number): string {
  return others > 0 ? ` (${plural(others, 'more row', 'more rows')} did not apply either.)` : ''
}

function appliedMessage(plan: EditPlan, isInOpenTransaction: boolean): string {
  const applied = `Applied ${plan.summary}.`
  return isInOpenTransaction
    ? `${applied} The changes are in the open transaction of this editor: commit it to keep them.`
    : applied
}
