import * as vscode from 'vscode'

import { CommandId, ContextKey, SQL_LANGUAGE } from '../command-id.ts'
import type { EditorBindings } from '../editor/bindings.ts'
import type { EditorTransactions } from './editor-transactions.ts'
import { transactionLook } from './transaction-look.ts'

export interface TransactionStatusDependencies {
  readonly bindings: EditorBindings
  readonly transactions: EditorTransactions
}

const PRIORITY = 99

// Beside the connection of the SQL editor in front, the status bar shows its transaction: the mode
// it runs in, or the transaction left open. A click switches the mode, or ends the transaction.
export class TransactionStatusItem implements vscode.Disposable {
  readonly #dependencies: TransactionStatusDependencies
  readonly #item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, PRIORITY)

  constructor(dependencies: TransactionStatusDependencies) {
    this.#dependencies = dependencies
    this.#item.name = 'sqldoro Transaction'
    this.#item.command = CommandId.ToggleTransactionMode
  }

  update(): void {
    const document = this.#boundSqlDocument()
    if (document === undefined) {
      this.#item.hide()
      this.#setContext(false)
      return
    }
    const uri = document.uri.toString()
    const look = transactionLook(this.#dependencies.transactions.of(uri))
    this.#item.text = look.text
    this.#item.tooltip = look.tooltip
    this.#item.backgroundColor =
      look.background === undefined ? undefined : new vscode.ThemeColor(look.background)
    this.#item.show()
    this.#setContext(this.#dependencies.transactions.isOpen(uri))
  }

  dispose(): void {
    this.#item.dispose()
  }

  // The document of the SQL editor in front, when it runs on a connection.
  #boundSqlDocument(): vscode.TextDocument | undefined {
    const document = vscode.window.activeTextEditor?.document
    const isBound =
      document?.languageId === SQL_LANGUAGE &&
      this.#dependencies.bindings.get(document.uri) !== undefined
    return isBound ? document : undefined
  }

  #setContext(hasOpenTransaction: boolean): void {
    void vscode.commands.executeCommand(
      'setContext',
      ContextKey.HasOpenTransaction,
      hasOpenTransaction,
    )
  }
}
