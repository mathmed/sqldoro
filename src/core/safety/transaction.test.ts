import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { TransactionStatus } from '../engine/transaction-status.ts'
import { StatementCategory } from './statement-class.ts'
import {
  began,
  beginStatement,
  changeMessage,
  type EditorTransaction,
  ended,
  implicitCommitWarning,
  isOpen,
  isTransactionMode,
  needsBegin,
  newTransaction,
  observe,
  switchedMode,
  TransactionChange,
  TransactionEnd,
  TransactionMode,
} from './transaction.ts'

const { Idle, Open, Failed, Unknown } = TransactionStatus
const AUTO = newTransaction(TransactionMode.Auto)
const MANUAL = newTransaction(TransactionMode.Manual)
const OPEN: EditorTransaction = { mode: TransactionMode.Manual, status: Open, statements: 2 }
const WRITE = { category: StatementCategory.Write, isSucceeded: true }

describe('the transaction of an editor', () => {
  it('should start idle, in the mode given', () => {
    expect(MANUAL).toStrictEqual({ mode: 'manual', status: 'idle', statements: 0 })
    expect(isTransactionMode('manual')).toBe(true)
    expect(isTransactionMode('auto')).toBe(true)
    expect(isTransactionMode('later')).toBe(false)
    expect(isTransactionMode(1)).toBe(false)
  })

  it('should be open until it is committed or rolled back, even when it failed', () => {
    expect(isOpen(AUTO)).toBe(false)
    expect(isOpen(OPEN)).toBe(true)
    expect(isOpen({ ...OPEN, status: Failed })).toBe(true)
  })

  it('should begin before a statement only in manual mode with nothing open', () => {
    expect(needsBegin(MANUAL)).toBe(true)
    expect(needsBegin(AUTO)).toBe(false)
    expect(needsBegin(OPEN)).toBe(false)
    expect(needsBegin({ ...OPEN, status: Failed })).toBe(false)
  })

  it('should end with COMMIT or ROLLBACK', () => {
    expect(TransactionEnd).toStrictEqual({ Commit: 'COMMIT', Rollback: 'ROLLBACK' })
  })

  it('should begin read-only transactions on read-only connections', () => {
    expect(beginStatement(false)).toBe('START TRANSACTION')
    expect(beginStatement(true)).toBe('START TRANSACTION READ ONLY')
  })

  it('should open with no statement and end with none', () => {
    expect(began({ ...MANUAL, statements: 4 })).toStrictEqual({ ...MANUAL, status: Open })
    expect(ended(OPEN)).toStrictEqual({ ...OPEN, status: Idle, statements: 0 })
  })

  it('should switch modes only while nothing is open', () => {
    expect(switchedMode(AUTO)).toStrictEqual(MANUAL)
    expect(switchedMode(MANUAL)).toStrictEqual(AUTO)
    expect(switchedMode(OPEN)).toBeUndefined()
  })
})

describe('observe', () => {
  it('should count the statements of an open transaction, transaction control aside', () => {
    expect(observe(OPEN, { status: Open, ...WRITE })).toStrictEqual({
      transaction: { ...OPEN, statements: 3 },
      change: TransactionChange.None,
    })
    const savepoint = { status: Open, category: StatementCategory.Transaction, isSucceeded: true }
    expect(observe(OPEN, savepoint).transaction.statements).toBe(2)
  })

  it('should see a transaction the user opened, and one that a statement opened', () => {
    const begin = { status: Open, category: StatementCategory.Transaction, isSucceeded: true }
    expect(observe(AUTO, begin)).toStrictEqual({
      transaction: { ...AUTO, status: Open, statements: 0 },
      change: TransactionChange.Opened,
    })
    expect(observe(AUTO, { status: Open, ...WRITE }).transaction.statements).toBe(1)
  })

  it('should tell how an open transaction ended', () => {
    const commit = { status: Idle, category: StatementCategory.Transaction, isSucceeded: true }
    const ddl = { status: Idle, category: StatementCategory.Ddl, isSucceeded: true }
    const deadlock = { status: Idle, category: StatementCategory.Write, isSucceeded: false }

    expect(observe(OPEN, commit)).toStrictEqual({
      transaction: { ...OPEN, status: Idle, statements: 0 },
      change: TransactionChange.Ended,
    })
    expect(observe(OPEN, ddl).change).toBe(TransactionChange.Committed)
    expect(observe(OPEN, deadlock).change).toBe(TransactionChange.RolledBack)
    expect(observe({ ...OPEN, status: Failed }, commit).change).toBe(TransactionChange.Ended)
  })

  it('should see a transaction fail, and come back from a savepoint', () => {
    const failure = { status: Failed, category: StatementCategory.Write, isSucceeded: false }
    const back = { status: Open, category: StatementCategory.Transaction, isSucceeded: true }

    expect(observe(OPEN, failure)).toStrictEqual({
      transaction: { ...OPEN, status: Failed, statements: 3 },
      change: TransactionChange.Failed,
    })
    expect(observe({ ...OPEN, status: Failed }, back).change).toBe(TransactionChange.None)
    expect(observe({ ...OPEN, status: Failed }, back).transaction.status).toBe(Open)
  })

  it('should keep what it knew when the server cannot tell', () => {
    expect(observe(OPEN, { status: Unknown, ...WRITE }).transaction).toStrictEqual({
      ...OPEN,
      statements: 3,
    })
    expect(observe(AUTO, { status: Unknown, ...WRITE })).toStrictEqual({
      transaction: AUTO,
      change: TransactionChange.None,
    })
  })

  it('should explain the changes nobody asked for', () => {
    expect(changeMessage(TransactionChange.Committed)).toBe(
      'This statement committed the open transaction: it cannot run inside one.',
    )
    expect(changeMessage(TransactionChange.RolledBack)).toBe(
      'The server rolled the open transaction back after this error.',
    )
    expect(changeMessage(TransactionChange.Failed)).toBe(
      'The transaction failed: roll it back to go on.',
    )
    expect(changeMessage(TransactionChange.Ended)).toBeUndefined()
    expect(changeMessage(TransactionChange.Opened)).toBeUndefined()
    expect(changeMessage(TransactionChange.None)).toBeUndefined()
  })
})

describe('implicitCommitWarning', () => {
  const ddl = [
    { category: StatementCategory.Read, verb: 'SELECT' },
    { category: StatementCategory.Ddl, verb: 'ALTER' },
    { category: StatementCategory.Ddl, verb: 'DROP' },
  ]

  it('should warn before DDL in a transaction where DDL commits at once', () => {
    const warning =
      'ALTER commits the open transaction and cannot be rolled back: this database commits DDL at once.'
    expect(implicitCommitWarning(ddl, MANUAL, MYSQL_DIALECT)).toBe(warning)
    expect(implicitCommitWarning(ddl, { ...AUTO, status: Open }, MYSQL_DIALECT)).toBe(warning)
  })

  it('should not warn without DDL, outside transactions, or where DDL is transactional', () => {
    expect(implicitCommitWarning(ddl.slice(0, 1), MANUAL, MYSQL_DIALECT)).toBeUndefined()
    expect(implicitCommitWarning(ddl, AUTO, MYSQL_DIALECT)).toBeUndefined()
    expect(implicitCommitWarning(ddl, MANUAL, POSTGRES_DIALECT)).toBeUndefined()
  })
})
