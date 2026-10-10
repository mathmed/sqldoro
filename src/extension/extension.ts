import * as vscode from 'vscode'

import { buildGreeting } from '../core/greeting.ts'
import { CommandId, ViewId } from './command-id.ts'
import { registerConnectionCommands } from './commands/connection-commands.ts'
import { registerExplorerCommands } from './commands/explorer-commands.ts'
import { registerWriteAccessCommands } from './commands/write-access-commands.ts'
import type { EditorSessions } from './editor/editor-sessions.ts'
import { registerQueryFeatures } from './query-features.ts'
import { createQueryServices, type WorkbenchContext } from './query-services.ts'
import { createServices, type Services, type StorageContext } from './services.ts'
import type { SessionManager } from './sessions/session-manager.ts'
import { readSettings } from './settings.ts'

type ActivationContext = Pick<vscode.ExtensionContext, 'extensionMode' | 'subscriptions'> &
  StorageContext &
  WorkbenchContext

const OUTPUT_CHANNEL = 'sqldoro'
const SHOW_OUTPUT = 'Show Output'

let openSessions: SessionManager | undefined
let editorSessions: EditorSessions | undefined

export function activate(context: ActivationContext): void {
  const log = vscode.window.createOutputChannel(OUTPUT_CHANNEL, { log: true })
  const services = createServices(context, log)
  const query = createQueryServices(context, services, log)
  const isDevelopment = context.extensionMode !== vscode.ExtensionMode.Production
  context.subscriptions.push(
    log,
    ...registerConnections(services, log),
    vscode.commands.registerCommand(CommandId.Hello, () => showGreeting(isDevelopment)),
    ...registerQueryFeatures(services, query, log),
  )
  query.status.update()
  query.transactionStatus.update()
  openSessions = services.sessions
  editorSessions = query.editorSessions
  reportUnreadableConnections(services, log)
}

// The Connections view and its commands (phase 1).
function registerConnections(
  services: Services,
  log: vscode.LogOutputChannel,
): vscode.Disposable[] {
  const view = vscode.window.createTreeView(ViewId.Connections, {
    treeDataProvider: services.explorer,
    showCollapseAll: true,
  })
  const commandContext = {
    ...services,
    log,
    setViewMessage: (message: string) => {
      view.message = message
    },
  }
  return [
    view,
    ...disposablesOf(services),
    services.store.onDidChange(() => {
      services.explorer.refresh()
    }),
    ...registerConnectionCommands(commandContext),
    ...registerExplorerCommands(commandContext),
    ...registerWriteAccessCommands({
      service: services.service,
      policy: () => readSettings().policy,
      log,
    }),
  ]
}

// VS Code waits for the sessions to close before it stops the extension host.
export async function deactivate(): Promise<void> {
  await Promise.all([openSessions?.disconnectAll(), editorSessions?.releaseAll()])
  openSessions = undefined
  editorSessions = undefined
}

function disposablesOf({ explorer, sessions, store }: Services): vscode.Disposable[] {
  return [explorer, sessions, store]
}

function reportUnreadableConnections({ store }: Services, log: vscode.LogOutputChannel): void {
  if (store.problems.length === 0) {
    return
  }
  void vscode.window
    .showWarningMessage(
      'Some saved connections cannot be read: the sqldoro output says why.',
      SHOW_OUTPUT,
    )
    .then((choice) => {
      if (choice === SHOW_OUTPUT) {
        log.show()
      }
    })
}

function showGreeting(isDevelopment: boolean): string {
  const greeting = buildGreeting(isDevelopment)
  // Awaiting would block the command until the user dismisses the notification.
  void vscode.window.showInformationMessage(greeting)
  return greeting
}
