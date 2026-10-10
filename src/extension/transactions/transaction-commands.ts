import * as vscode from 'vscode'

import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import type { Logger } from '../../core/platform.ts'
import { isOpen, TransactionEnd } from '../../core/safety/transaction.ts'
import { CommandId } from '../command-id.ts'
import { registerAll } from '../commands/command-context.ts'
import { activeSqlEditor } from '../editor/active-editor.ts'
import type { EditorSessions } from '../editor/editor-sessions.ts'
import type { QueryRunner } from '../editor/query-runner.ts'
import { askChoice } from '../form/prompts.ts'
import type { EditorTransactions } from './editor-transactions.ts'
import { transactionLook } from './transaction-look.ts'

export interface TransactionCommandContext {
  readonly runner: QueryRunner
  readonly transactions: EditorTransactions
  readonly editorSessions: EditorSessions
  readonly log: Logger
}

const NOTHING_OPEN = 'There is no open transaction in this editor.'
const FAILED_COMMIT =
  'The transaction failed: the database can only roll it back. Roll it back to go on.'
const END_CHOICES = [
  { label: '$(check) Commit', value: TransactionEnd.Commit },
  { label: '$(discard) Roll Back', value: TransactionEnd.Rollback },
] as const

export function registerTransactionCommands(
  context: TransactionCommandContext,
): vscode.Disposable[] {
  return [
    // Answers how the status bar now shows the transaction (the smoke test reads it).
    vscode.commands.registerCommand(CommandId.ToggleTransactionMode, async () =>
      toggleMode(context),
    ),
    ...registerAll(context, [
      { id: CommandId.CommitTransaction, action: 'Commit', run: endIn(TransactionEnd.Commit) },
      {
        id: CommandId.RollbackTransaction,
        action: 'Roll Back',
        run: endIn(TransactionEnd.Rollback),
      },
    ]),
  ]
}

// Between transactions the mode switches; with one open, the user ends it first.
async function toggleMode(context: TransactionCommandContext): Promise<string | undefined> {
  const editor = activeSqlEditor()
  if (editor === undefined) {
    return undefined
  }
  const uri = editor.document.uri.toString()
  const switched = context.transactions.switchMode(uri)
  if (switched === undefined) {
    const statement = await askChoice('Commit or Roll Back the Open Transaction', END_CHOICES)
    if (statement !== undefined) {
      await endTransaction(context, editor.document, statement)
    }
  }
  return transactionLook(context.transactions.of(uri)).text
}

function endIn(statement: TransactionEnd): (context: TransactionCommandContext) => Promise<void> {
  return async (context) => {
    const editor = activeSqlEditor()
    if (editor !== undefined) {
      await endTransaction(context, editor.document, statement)
    }
  }
}

// COMMIT or ROLLBACK on the session of the editor, while no query runs there.
export async function endTransaction(
  context: TransactionCommandContext,
  document: vscode.TextDocument,
  statement: TransactionEnd,
): Promise<void> {
  const uri = document.uri.toString()
  const transaction = context.transactions.of(uri)
  const session = context.editorSessions.existing(uri)
  if (!isOpen(transaction) || session === undefined) {
    void vscode.window.showInformationMessage(NOTHING_OPEN)
    return
  }
  if (statement === TransactionEnd.Commit && transaction.status === TransactionStatus.Failed) {
    void vscode.window.showWarningMessage(FAILED_COMMIT)
    return
  }
  await context.runner.exclusive(document.uri, async () => {
    const place = await context.transactions.end(uri, (await session).engineSession, statement)
    const ended = statement === TransactionEnd.Commit ? 'Committed' : 'Rolled back'
    void vscode.window.showInformationMessage(`${ended} the transaction of ${place}.`)
  })
}
