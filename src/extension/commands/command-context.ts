import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { Logger } from '../../core/platform.ts'
import { describeError } from '../../core/text/errors.ts'
import type { ConnectionService } from '../connections/connection-service.ts'
import { askChoice } from '../form/prompts.ts'
import type { SessionManager } from '../sessions/session-manager.ts'
import type { SessionOpener } from '../sessions/session-opener.ts'
import type { SecretStore } from '../storage/secret-store.ts'
import type { ExplorerProvider } from '../tree/explorer-provider.ts'
import type { TableIndex } from '../tree/table-index.ts'

export interface CommandContext {
  readonly service: ConnectionService
  readonly sessions: SessionManager
  readonly secrets: SecretStore
  readonly open: SessionOpener
  readonly explorer: ExplorerProvider
  // Every table and view of the connected connections, to find them by name.
  readonly index: Pick<TableIndex, 'objects'>
  // Shows a line above the Connections view; an empty message hides it.
  readonly setViewMessage: (message: string) => void
  readonly log: Logger
}

export interface CommandSpec<C = CommandContext> {
  readonly id: string
  readonly action: string
  // The target is the tree node, connection id or nothing VS Code calls the command with. What it
  // resolves with is what the command answers.
  readonly run: (context: C, target: unknown) => Promise<unknown>
}

export function registerAll<C extends { readonly log: Logger }>(
  context: C,
  commands: readonly CommandSpec<C>[],
): vscode.Disposable[] {
  return commands.map(({ id, action, run }) =>
    vscode.commands.registerCommand(
      id,
      guarded(context, action, async (target?: unknown) => run(context, target)),
    ),
  )
}

// A command that fails says why in a notification and in the log, instead of a stack trace, and
// answers nothing.
function guarded<T extends unknown[]>(
  context: { readonly log: Logger },
  action: string,
  run: (...args: T) => Promise<unknown>,
): (...args: T) => Promise<unknown> {
  return async (...args) => {
    try {
      return await run(...args)
    } catch (error) {
      const message = describeError(error)
      context.log.error(`${action} failed: ${message}`)
      void vscode.window.showErrorMessage(`${action} failed: ${message}`)
      return undefined
    }
  }
}

// Commands get a tree node from the views, a connection id from links, or nothing from the
// Command Palette, where the user picks the connection.
export async function connectionFrom(
  argument: unknown,
  context: Pick<CommandContext, 'service'>,
  title: string,
): Promise<ConnectionConfig | undefined> {
  const id = connectionIdOf(argument)
  if (id !== undefined) {
    return context.service.find(id)
  }
  const connections = context.service.list()
  if (connections.length === 0) {
    void vscode.window.showInformationMessage('There is no connection yet: add one first.')
    return undefined
  }
  return askChoice(
    title,
    connections.map((connection) => ({
      label: connection.name,
      description: connection.host,
      value: connection,
    })),
  )
}

function connectionIdOf(argument: unknown): string | undefined {
  return typeof argument === 'string' ? argument : nodeConnectionId(argument)
}

function nodeConnectionId(argument: unknown): string | undefined {
  if (typeof argument !== 'object' || argument === null || !('connectionId' in argument)) {
    return undefined
  }
  return typeof argument.connectionId === 'string' ? argument.connectionId : undefined
}
