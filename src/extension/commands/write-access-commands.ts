import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { Logger } from '../../core/platform.ts'
import {
  confirmationProblem,
  type GuardPolicy,
  isConfirmed,
  isProduction,
} from '../../core/safety/guard.ts'
import { CommandId } from '../command-id.ts'
import type { ConnectionService } from '../connections/connection-service.ts'
import { askText } from '../form/prompts.ts'
import { connectionFrom, registerAll } from './command-context.ts'

export interface WriteAccessContext {
  readonly service: ConnectionService
  readonly policy: () => GuardPolicy
  readonly log: Logger
}

const ALLOW = 'Allow Writes'

// Whether a connection may write is a setting of the connection, changed on purpose: never a
// confirmation on the way to a statement. Its sessions open again with the new setting.
export function registerWriteAccessCommands(context: WriteAccessContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.AllowWrites, action: 'Allow Writes', run: allowWrites },
    { id: CommandId.MakeReadOnly, action: 'Make Read-Only', run: makeReadOnly },
  ])
}

async function allowWrites(context: WriteAccessContext, target: unknown): Promise<void> {
  const connection = await connectionFrom(target, context, 'Allow Writes on a Connection')
  if (connection === undefined) {
    return
  }
  if (!connection.isReadOnly) {
    void vscode.window.showInformationMessage(`Writes are already allowed on "${connection.name}".`)
    return
  }
  if (!(await isAllowed(connection, context.policy()))) {
    return
  }
  await context.service.save({ ...connection, isReadOnly: false }, new Map())
  context.log.warn(`Writes allowed on "${connection.name}"`)
  void vscode.window.showInformationMessage(
    `Writes are allowed on "${connection.name}": run the statement again. sqldoro still asks before an UPDATE or a DELETE that reaches every row.`,
  )
}

// A modal confirmation; on production, the name of the connection typed.
async function isAllowed(connection: ConnectionConfig, policy: GuardPolicy): Promise<boolean> {
  const { name } = connection
  if (!isProduction(connection.environment, policy)) {
    const choice = await vscode.window.showWarningMessage(
      `Allow writes on "${name}"?`,
      {
        modal: true,
        detail:
          'Statements that change data, the schema or the session will run on it. Make it read-only again at any time.',
      },
      ALLOW,
    )
    return choice === ALLOW
  }
  const badge = connection.environment.toUpperCase()
  const typed = await askText({
    title: `Allow Writes on ${badge}: ${name}`,
    prompt: `"${name}" is tagged ${badge}. Type ${name} to allow writes on it.`,
    value: '',
    placeHolder: name,
    validate: (value) => confirmationProblem(value, name),
  })
  return typed !== undefined && isConfirmed(typed, name)
}

async function makeReadOnly(context: WriteAccessContext, target: unknown): Promise<void> {
  const connection = await connectionFrom(target, context, 'Make a Connection Read-Only')
  if (connection === undefined) {
    return
  }
  if (connection.isReadOnly) {
    void vscode.window.showInformationMessage(`"${connection.name}" is read-only already.`)
    return
  }
  await context.service.save({ ...connection, isReadOnly: true }, new Map())
  context.log.info(`"${connection.name}" made read-only`)
  void vscode.window.showInformationMessage(`"${connection.name}" is read-only again.`)
}
