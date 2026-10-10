// Where a session stands, as its server reports it after a statement: outside a transaction,
// inside one, or inside one that a failed statement aborted (PostgreSQL then only accepts ROLLBACK).
// Unknown when the driver cannot tell.
export const TransactionStatus = {
  Idle: 'idle',
  Open: 'open',
  Failed: 'failed',
  Unknown: 'unknown',
} as const

export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus]
