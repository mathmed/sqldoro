import { TransactionStatus } from '../engine/transaction-status.ts'
import { type EditorTransaction, isOpen, TransactionMode } from '../safety/transaction.ts'

// How the statements of the changes run: in a transaction of their own, committed when every one
// applied and rolled back otherwise; or in the transaction of the editor (manual mode, or one the
// user opened), inside a savepoint that a failure rolls back to, leaving the commit to the user.
export const BatchMode = {
  Own: 'own',
  Joined: 'joined',
} as const

export type BatchMode = (typeof BatchMode)[keyof typeof BatchMode]

export interface BatchSteps {
  readonly begin: readonly string[]
  readonly commit: readonly string[]
  readonly rollback: readonly string[]
}

const SAVEPOINT = 'sqldoro_edits'

const OWN_STEPS: BatchSteps = {
  begin: ['START TRANSACTION'],
  commit: ['COMMIT'],
  rollback: ['ROLLBACK'],
}
const JOINED_STEPS: BatchSteps = {
  begin: [`SAVEPOINT ${SAVEPOINT}`],
  commit: [`RELEASE SAVEPOINT ${SAVEPOINT}`],
  rollback: [`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`, `RELEASE SAVEPOINT ${SAVEPOINT}`],
}

// sqldoro's own transaction statements: like the ones of manual transactions, they need no guard.
export function batchSteps(mode: BatchMode): BatchSteps {
  return mode === BatchMode.Own ? OWN_STEPS : JOINED_STEPS
}

export const FAILED_TRANSACTION =
  'The transaction of this editor failed: roll it back before applying changes.'

// Undefined when the transaction of the editor failed: it only takes a rollback.
export function batchMode(transaction: EditorTransaction): BatchMode | undefined {
  if (transaction.status === TransactionStatus.Failed) {
    return undefined
  }
  return isOpen(transaction) || transaction.mode === TransactionMode.Manual
    ? BatchMode.Joined
    : BatchMode.Own
}
