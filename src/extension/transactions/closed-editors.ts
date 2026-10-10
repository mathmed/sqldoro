import * as vscode from 'vscode'

import { TransactionEnd } from '../../core/safety/transaction.ts'
import { documentLabel } from '../editor/document-label.ts'
import { endTransaction, type TransactionCommandContext } from './transaction-commands.ts'

const COMMIT = 'Commit'
const ROLL_BACK = 'Roll Back'

// Closing the last tab of an editor with an open transaction does not end it: the user is told,
// and chooses. When the document itself closes, its session rolls the transaction back.
export function watchClosedEditors(context: TransactionCommandContext): vscode.Disposable {
  return vscode.window.tabGroups.onDidChangeTabs((event) => {
    for (const tab of event.closed) {
      warnIfLeftOpen(context, textUriOf(tab))
    }
  })
}

function warnIfLeftOpen(context: TransactionCommandContext, uri: vscode.Uri | undefined): void {
  if (uri === undefined || !context.transactions.isOpen(uri.toString()) || isShown(uri)) {
    return
  }
  void vscode.window
    .showWarningMessage(
      `"${documentLabel(uri)}" was closed with an open transaction: commit or roll it back.`,
      COMMIT,
      ROLL_BACK,
    )
    .then(async (choice) => endChosen(context, uri, choice))
}

async function endChosen(
  context: TransactionCommandContext,
  uri: vscode.Uri,
  choice: string | undefined,
): Promise<void> {
  const document = vscode.workspace.textDocuments.find(
    (open) => open.uri.toString() === uri.toString(),
  )
  if (choice === undefined || document === undefined) {
    return
  }
  const statement = choice === COMMIT ? TransactionEnd.Commit : TransactionEnd.Rollback
  await endTransaction(context, document, statement)
}

function textUriOf(tab: vscode.Tab): vscode.Uri | undefined {
  return tab.input instanceof vscode.TabInputText ? tab.input.uri : undefined
}

function isShown(uri: vscode.Uri): boolean {
  return vscode.window.tabGroups.all.some((group) =>
    group.tabs.some((tab) => textUriOf(tab)?.toString() === uri.toString()),
  )
}
