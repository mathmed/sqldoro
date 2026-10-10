import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { plural } from '../../core/results/tabs.ts'
import { type EditorTransaction, TransactionMode } from '../../core/safety/transaction.ts'

// How the status bar shows the transaction of the editor in front.
export interface TransactionLook {
  readonly text: string
  readonly tooltip: string
  // A theme color for the background: the status bar only knows its warning and error ones.
  readonly background: string | undefined
}

const AUTO: TransactionLook = {
  text: '$(check-all) Auto-commit',
  tooltip: 'Each statement commits as it runs. Click to switch to manual commit.',
  background: undefined,
}
const MANUAL: TransactionLook = {
  text: '$(git-commit) Manual commit',
  tooltip:
    'The next statement opens a transaction that you commit or roll back. Click to switch to auto-commit.',
  background: undefined,
}
const FAILED: TransactionLook = {
  text: '$(error) Transaction failed',
  tooltip: 'A statement failed and aborted the transaction: click to roll it back.',
  background: 'statusBarItem.errorBackground',
}

export function transactionLook(transaction: EditorTransaction): TransactionLook {
  if (transaction.status === TransactionStatus.Failed) {
    return FAILED
  }
  if (transaction.status === TransactionStatus.Open) {
    return {
      text: `$(circle-filled) Transaction: ${plural(transaction.statements, 'statement', 'statements')}`,
      tooltip: 'A transaction is open on this editor: click to commit or roll it back.',
      background: 'statusBarItem.warningBackground',
    }
  }
  return transaction.mode === TransactionMode.Manual ? MANUAL : AUTO
}
