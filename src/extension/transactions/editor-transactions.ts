import * as vscode from 'vscode'

import type { EngineSession } from '../../core/engine/engine.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import type { Logger } from '../../core/platform.ts'
import type { StatementCategory } from '../../core/safety/statement-class.ts'
import {
  began,
  beginStatement,
  changeMessage,
  type EditorTransaction,
  ended,
  isOpen,
  needsBegin,
  newTransaction,
  observe,
  switchedMode,
  TransactionEnd,
  type TransactionMode,
} from '../../core/safety/transaction.ts'
import { describeError } from '../../core/text/errors.ts'

export interface EditorTransactionsDependencies {
  readonly defaultMode: () => TransactionMode
  readonly log: Logger
}

// The session an editor runs on, and how messages name it: "Untitled-1" on "Shop".
export interface TransactionScope {
  readonly uri: string
  readonly session: EngineSession
  readonly place: string
  readonly isReadOnly: boolean
}

export interface StatementStep {
  readonly category: StatementCategory
  readonly isSucceeded: boolean
}

// Why the session of an editor closes: the user hears about the transaction it rolls back, except
// when VS Code shuts down.
export const CloseReason = {
  EditorClosed: 'editorClosed',
  ConnectionClosed: 'connectionClosed',
  ConnectionChanged: 'connectionChanged',
  // The changes of the grid could not be rolled back: closing the session makes the server do it.
  RollbackFailed: 'rollbackFailed',
  Shutdown: 'shutdown',
} as const

export type CloseReason = (typeof CloseReason)[keyof typeof CloseReason]

const CLOSE_REASONS: ReadonlyMap<CloseReason, string> = new Map([
  [CloseReason.EditorClosed, 'its editor was closed'],
  [CloseReason.ConnectionClosed, 'its connection was closed'],
  [CloseReason.ConnectionChanged, 'its editor moved to another connection'],
  [CloseReason.RollbackFailed, 'the changes of its results could not be rolled back otherwise'],
])

// The transaction of an editor, and how messages name where it runs.
interface Entry {
  readonly transaction: EditorTransaction
  readonly place: string
}

function ignore(): void {
  // sqldoro's own transaction statements return no rows.
}

// The transaction of each SQL editor: its mode, and whether one is open on the editor's session, as
// the server says after each statement.
export class EditorTransactions implements vscode.Disposable {
  readonly #dependencies: EditorTransactionsDependencies
  readonly #entries = new Map<string, Entry>()
  readonly #changes = new vscode.EventEmitter<string>()
  readonly onDidChange = this.#changes.event

  constructor(dependencies: EditorTransactionsDependencies) {
    this.#dependencies = dependencies
  }

  of(uri: string): EditorTransaction {
    return this.#entries.get(uri)?.transaction ?? newTransaction(this.#dependencies.defaultMode())
  }

  isOpen(uri: string): boolean {
    return isOpen(this.of(uri))
  }

  // Undefined while a transaction is open: it is committed or rolled back first.
  switchMode(uri: string): EditorTransaction | undefined {
    const switched = switchedMode(this.of(uri))
    if (switched !== undefined) {
      this.#set(uri, { transaction: switched, place: '' })
    }
    return switched
  }

  // In manual mode, the first statement opens the transaction.
  async beforeStatement(scope: TransactionScope): Promise<void> {
    const transaction = this.of(scope.uri)
    if (!needsBegin(transaction)) {
      return
    }
    await runControl(scope.session, beginStatement(scope.isReadOnly))
    this.#set(scope.uri, { transaction: began(transaction), place: scope.place })
    this.#dependencies.log.info(`Began a transaction in ${scope.place}`)
  }

  // What the server says after the statement; the message of a change nobody asked for, if any.
  async afterStatement(scope: TransactionScope, step: StatementStep): Promise<string | undefined> {
    const status = await this.#statusOf(scope.session)
    const { transaction, change } = observe(this.of(scope.uri), { status, ...step })
    this.#set(scope.uri, { transaction, place: scope.place })
    const message = changeMessage(change)
    if (message !== undefined) {
      this.#dependencies.log.warn(`${scope.place}: ${message}`)
    }
    return message
  }

  // COMMIT or ROLLBACK, asked for by the user; says where it ran.
  async end(uri: string, session: EngineSession, statement: TransactionEnd): Promise<string> {
    const place = this.#entries.get(uri)?.place ?? uri
    await runControl(session, statement)
    this.#set(uri, { transaction: ended(this.of(uri)), place })
    this.#dependencies.log.info(`${statement} in ${place}`)
    return place
  }

  // Before the session of an editor closes: what is open is rolled back, and the user told.
  readonly beforeClose = async (
    uri: string,
    session: EngineSession,
    reason: CloseReason,
  ): Promise<void> => {
    const entry = this.#openEntry(uri)
    if (entry === undefined) {
      return
    }
    try {
      await runControl(session, TransactionEnd.Rollback)
    } catch (error) {
      this.#dependencies.log.warn(`Could not roll back ${entry.place}: ${describeError(error)}`)
    }
    const message = `Rolled back the open transaction of ${entry.place}`
    this.#dependencies.log.warn(`${message} (${reason})`)
    const why = CLOSE_REASONS.get(reason)
    if (why !== undefined) {
      void vscode.window.showWarningMessage(`${message}: ${why}.`)
    }
  }

  // The session ended by itself: the server rolled back what was open.
  readonly onLost = (uri: string): void => {
    const entry = this.#openEntry(uri)
    if (entry !== undefined) {
      const message = `The connection of ${entry.place} ended: the server rolled back its open transaction.`
      this.#dependencies.log.warn(message)
      void vscode.window.showWarningMessage(message)
    }
  }

  // A session with an open transaction stays where it is: the transaction lives there.
  readonly isPinned = (uri: string): boolean => this.isOpen(uri)

  // A closed editor takes its mode with it.
  forget(uri: string): void {
    this.#entries.delete(uri)
  }

  dispose(): void {
    this.#changes.dispose()
  }

  #set(uri: string, entry: Entry): void {
    this.#entries.set(uri, entry)
    this.#changes.fire(uri)
  }

  // The entry of an open transaction, which ends here: the caller rolls it back or reports it lost.
  #openEntry(uri: string): Entry | undefined {
    const entry = this.#entries.get(uri)
    if (entry === undefined || !isOpen(entry.transaction)) {
      return undefined
    }
    this.#set(uri, { ...entry, transaction: ended(entry.transaction) })
    return entry
  }

  async #statusOf(session: EngineSession): Promise<TransactionStatus> {
    try {
      return await session.transactionStatus()
    } catch (error) {
      this.#dependencies.log.warn(`Could not read the transaction status: ${describeError(error)}`)
      return TransactionStatus.Unknown
    }
  }
}

async function runControl(session: EngineSession, sql: string): Promise<void> {
  await session.execute({ sql, values: [], maxRows: 0, onColumns: ignore, onRows: ignore }).result
}
