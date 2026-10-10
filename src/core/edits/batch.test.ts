import { describe, expect, it } from 'vitest'

import { TransactionStatus } from '../engine/transaction-status.ts'
import { TransactionMode } from '../safety/transaction.ts'
import { batchMode, BatchMode, batchSteps, FAILED_TRANSACTION } from './batch.ts'

describe('batchMode', () => {
  it.each([
    [TransactionMode.Auto, TransactionStatus.Idle, BatchMode.Own],
    [TransactionMode.Auto, TransactionStatus.Open, BatchMode.Joined],
    [TransactionMode.Manual, TransactionStatus.Idle, BatchMode.Joined],
    [TransactionMode.Manual, TransactionStatus.Open, BatchMode.Joined],
    [TransactionMode.Auto, TransactionStatus.Unknown, BatchMode.Joined],
    [TransactionMode.Auto, TransactionStatus.Failed, undefined],
    [TransactionMode.Manual, TransactionStatus.Failed, undefined],
  ])(
    'should run the changes of a %s editor whose transaction is %s as %s',
    (mode, status, expected) => {
      expect(batchMode({ mode, status, statements: 0 })).toBe(expected)
    },
  )
})

describe('batchSteps', () => {
  it('should commit or roll back a transaction of their own', () => {
    expect(batchSteps(BatchMode.Own)).toStrictEqual({
      begin: ['START TRANSACTION'],
      commit: ['COMMIT'],
      rollback: ['ROLLBACK'],
    })
  })

  it('should release or roll back to a savepoint in the transaction of the editor', () => {
    expect(batchSteps(BatchMode.Joined)).toStrictEqual({
      begin: ['SAVEPOINT sqldoro_edits'],
      commit: ['RELEASE SAVEPOINT sqldoro_edits'],
      rollback: ['ROLLBACK TO SAVEPOINT sqldoro_edits', 'RELEASE SAVEPOINT sqldoro_edits'],
    })
  })
})

describe('FAILED_TRANSACTION', () => {
  it('should say why nothing applies in a failed transaction', () => {
    expect(FAILED_TRANSACTION).toBe(
      'The transaction of this editor failed: roll it back before applying changes.',
    )
  })
})
