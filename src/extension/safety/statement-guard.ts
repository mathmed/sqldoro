import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import type { Logger } from '../../core/platform.ts'
import { classifyStatement } from '../../core/safety/classify.ts'
import {
  assessRun,
  type Confirmation,
  confirmationProblem,
  type GuardPolicy,
  type GuardTarget,
  isConfirmed,
  Verdict,
} from '../../core/safety/guard.ts'
import {
  describeStatement,
  StatementCategory,
  type StatementClass,
} from '../../core/safety/statement-class.ts'
import { type EditorTransaction, implicitCommitWarning } from '../../core/safety/transaction.ts'
import { CommandId } from '../command-id.ts'
import { Approval } from './approval.ts'

export interface StatementGuardDependencies {
  readonly policy: () => GuardPolicy
  readonly log: Logger
}

// A run about to start: where it runs, and every statement it may execute.
export interface GuardRequest {
  readonly connection: ConnectionConfig
  readonly dialect: Dialect
  readonly statements: readonly string[]
  readonly transaction: EditorTransaction
}

const ALLOW_WRITES = 'Allow Writes…'
const RUN_AND_COMMIT = 'Run and Commit'

// The one place every statement goes through before it runs (editor runs, scripts, history, EXPLAIN,
// server views, and the edits of later phases): it classifies the statements, applies the guards of
// the connection, asks for the confirmations they need and logs what it decided, without SQL text or
// values.
export class StatementGuard {
  readonly #dependencies: StatementGuardDependencies

  constructor(dependencies: StatementGuardDependencies) {
    this.#dependencies = dependencies
  }

  // The approval of the run, or undefined when it must not run.
  async approve(request: GuardRequest): Promise<Approval | undefined> {
    const checked = request.statements.map(
      (sql) => [sql, classifyStatement(sql, request.dialect)] as const,
    )
    const classes = checked.map(([, statement]) => statement)
    const isApproved =
      (await this.#passesGuards(request, classes)) &&
      (await this.#acceptsImplicitCommit(request, classes))
    if (!isApproved) {
      return undefined
    }
    this.#logAllowed(request.connection, classes)
    return new Approval(new Map(checked))
  }

  async #passesGuards(request: GuardRequest, classes: readonly StatementClass[]): Promise<boolean> {
    const { connection } = request
    const decision = assessRun(classes, targetOf(connection), this.#dependencies.policy())
    if (decision.verdict === Verdict.Block) {
      this.#dependencies.log.warn(`Guard: ${decision.logLine}`)
      offerToAllowWrites(decision.message, connection)
      return false
    }
    return (
      decision.verdict === Verdict.Allow || this.#confirmAll(decision.confirmations, connection)
    )
  }

  // Each confirmation in turn: the first one dismissed stops the run.
  async #confirmAll(
    confirmations: readonly Confirmation[],
    connection: ConnectionConfig,
  ): Promise<boolean> {
    for (const confirmation of confirmations) {
      if (!(await askTyped(confirmation))) {
        this.#dependencies.log.info(`Guard: not confirmed, nothing ran on "${connection.name}"`)
        return false
      }
      this.#dependencies.log.warn(`Guard override on "${connection.name}": ${confirmation.logLine}`)
    }
    return true
  }

  async #acceptsImplicitCommit(
    request: GuardRequest,
    classes: readonly StatementClass[],
  ): Promise<boolean> {
    const warning = implicitCommitWarning(classes, request.transaction, request.dialect)
    if (warning === undefined) {
      return true
    }
    const choice = await vscode.window.showWarningMessage(
      warning,
      { modal: true, detail: 'The statements before it in the transaction are committed too.' },
      RUN_AND_COMMIT,
    )
    this.#dependencies.log.info(
      `Guard: DDL in a transaction on "${request.connection.name}" ${choice === RUN_AND_COMMIT ? 'confirmed' : 'not confirmed'}`,
    )
    return choice === RUN_AND_COMMIT
  }

  // Reads are routine: the log keeps them at debug level.
  #logAllowed(connection: ConnectionConfig, classes: readonly StatementClass[]): void {
    const verbs = [...new Set(classes.map(describeStatement))].join(', ')
    const line = `Guard: allowed ${verbs} on "${connection.name}"`
    if (classes.every((statement) => statement.category === StatementCategory.Read)) {
      this.#dependencies.log.debug(line)
      return
    }
    this.#dependencies.log.info(line)
  }
}

function targetOf(connection: ConnectionConfig): GuardTarget {
  return {
    name: connection.name,
    environment: connection.environment,
    isReadOnly: connection.isReadOnly,
  }
}

// Turning read-only off is a deliberate act of its own: the button opens it, it never re-runs the
// statement.
function offerToAllowWrites(message: string, connection: ConnectionConfig): void {
  void vscode.window.showErrorMessage(message, ALLOW_WRITES).then(async (choice) => {
    if (choice === ALLOW_WRITES) {
      await vscode.commands.executeCommand(CommandId.AllowWrites, connection.id)
    }
  })
}

async function askTyped(confirmation: Confirmation): Promise<boolean> {
  const typed = await vscode.window.showInputBox({
    title: confirmation.title,
    prompt: confirmation.prompt,
    placeHolder: confirmation.expected,
    ignoreFocusOut: true,
    validateInput: (value) => confirmationProblem(value, confirmation.expected),
  })
  return typed !== undefined && isConfirmed(typed, confirmation.expected)
}
