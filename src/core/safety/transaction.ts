import type { Dialect } from '../engine/dialect.ts'
import { TransactionStatus } from '../engine/transaction-status.ts'
import { StatementCategory, type StatementClass } from './statement-class.ts'

// Auto-commit: each statement commits as it runs. Manual: the first statement opens a transaction
// that stays open until Commit or Roll Back.
export const TransactionMode = {
  Auto: 'auto',
  Manual: 'manual',
} as const

export type TransactionMode = (typeof TransactionMode)[keyof typeof TransactionMode]

// What happened to the transaction of an editor with the statement that just ran.
export const TransactionChange = {
  None: 'none',
  Opened: 'opened',
  // COMMIT, ROLLBACK or END ended it.
  Ended: 'ended',
  // A statement that cannot run in a transaction (DDL in MySQL) committed it first.
  Committed: 'committed',
  // The server rolled it back when the statement failed (a deadlock).
  RolledBack: 'rolledBack',
  // The statement failed and PostgreSQL aborted the transaction: only a rollback ends it.
  Failed: 'failed',
} as const

export type TransactionChange = (typeof TransactionChange)[keyof typeof TransactionChange]

export interface EditorTransaction {
  readonly mode: TransactionMode
  // Idle, Open or Failed, as the server said last.
  readonly status: TransactionStatus
  // The statements run since it opened, transaction control aside.
  readonly statements: number
}

export interface Observation {
  // What the server says after the statement; Unknown leaves the status as it was.
  readonly status: TransactionStatus
  readonly category: StatementCategory
  readonly isSucceeded: boolean
}

export interface Observed {
  readonly transaction: EditorTransaction
  readonly change: TransactionChange
}

// How the user ends a transaction.
export const TransactionEnd = {
  Commit: 'COMMIT',
  Rollback: 'ROLLBACK',
} as const

export type TransactionEnd = (typeof TransactionEnd)[keyof typeof TransactionEnd]

const START_TRANSACTION = 'START TRANSACTION'
const READ_ONLY = ' READ ONLY'
const MODES: ReadonlySet<string> = new Set(Object.values(TransactionMode))

export function isTransactionMode(value: unknown): value is TransactionMode {
  return typeof value === 'string' && MODES.has(value)
}

export function newTransaction(mode: TransactionMode): EditorTransaction {
  return { mode, status: TransactionStatus.Idle, statements: 0 }
}

// Open, or failed and waiting for its rollback.
export function isOpen(transaction: EditorTransaction): boolean {
  return transaction.status !== TransactionStatus.Idle
}

// In manual mode, a statement that finds no transaction open starts one.
export function needsBegin(transaction: EditorTransaction): boolean {
  return transaction.mode === TransactionMode.Manual && !isOpen(transaction)
}

// On a read-only connection the transaction is read-only too, whatever the session says.
export function beginStatement(isReadOnly: boolean): string {
  return isReadOnly ? `${START_TRANSACTION}${READ_ONLY}` : START_TRANSACTION
}

export function began(transaction: EditorTransaction): EditorTransaction {
  return { ...transaction, status: TransactionStatus.Open, statements: 0 }
}

export function ended(transaction: EditorTransaction): EditorTransaction {
  return { ...transaction, status: TransactionStatus.Idle, statements: 0 }
}

// The mode changes only between transactions: an open one is committed or rolled back first.
export function switchedMode(transaction: EditorTransaction): EditorTransaction | undefined {
  if (isOpen(transaction)) {
    return undefined
  }
  const mode =
    transaction.mode === TransactionMode.Auto ? TransactionMode.Manual : TransactionMode.Auto
  return { ...transaction, mode }
}

// The transaction after a statement, from what the server says about it.
export function observe(transaction: EditorTransaction, observation: Observation): Observed {
  const status =
    observation.status === TransactionStatus.Unknown ? transaction.status : observation.status
  const counted = observation.category === StatementCategory.Transaction ? 0 : 1
  const statements = status === TransactionStatus.Idle ? 0 : transaction.statements + counted
  return {
    transaction: { ...transaction, status, statements },
    change: changeOf(transaction.status, status, observation),
  }
}

function changeOf(
  before: TransactionStatus,
  after: TransactionStatus,
  observation: Observation,
): TransactionChange {
  if (before === after) {
    return TransactionChange.None
  }
  if (before === TransactionStatus.Idle) {
    return TransactionChange.Opened
  }
  if (after === TransactionStatus.Idle) {
    return endingOf(observation)
  }
  // Back to open from failed: ROLLBACK TO SAVEPOINT.
  return after === TransactionStatus.Failed ? TransactionChange.Failed : TransactionChange.None
}

function endingOf(observation: Observation): TransactionChange {
  if (observation.category === StatementCategory.Transaction) {
    return TransactionChange.Ended
  }
  return observation.isSucceeded ? TransactionChange.Committed : TransactionChange.RolledBack
}

const CHANGE_MESSAGES: ReadonlyMap<TransactionChange, string> = new Map([
  [
    TransactionChange.Committed,
    'This statement committed the open transaction: it cannot run inside one.',
  ],
  [TransactionChange.RolledBack, 'The server rolled the open transaction back after this error.'],
  [TransactionChange.Failed, 'The transaction failed: roll it back to go on.'],
])

// What people must know about a change they did not ask for; undefined for the others.
export function changeMessage(change: TransactionChange): string | undefined {
  return CHANGE_MESSAGES.get(change)
}

// DDL cannot be rolled back where it commits at once (MySQL): before running it in a transaction,
// sqldoro says so.
export function implicitCommitWarning(
  statements: readonly Pick<StatementClass, 'category' | 'verb'>[],
  transaction: EditorTransaction,
  dialect: Pick<Dialect, 'hasTransactionalDdl'>,
): string | undefined {
  const isTransactional = transaction.mode === TransactionMode.Manual || isOpen(transaction)
  const ddl = statements.find((statement) => statement.category === StatementCategory.Ddl)
  if (dialect.hasTransactionalDdl || !isTransactional || ddl === undefined) {
    return undefined
  }
  return `${ddl.verb} commits the open transaction and cannot be rolled back: this database commits DDL at once.`
}
