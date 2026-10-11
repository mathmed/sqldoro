import * as vscode from 'vscode'

import { buildGreeting } from '../core/greeting.ts'
import { CommandId, ViewId } from './command-id.ts'
import { registerConnectionCommands } from './commands/connection-commands.ts'
import { registerExplorerCommands } from './commands/explorer-commands.ts'
import { registerFindCommands } from './commands/find-commands.ts'
import { registerFolderCommands } from './commands/folder-commands.ts'
import { registerWriteAccessCommands } from './commands/write-access-commands.ts'
import { listServerDatabases, pingServer } from './connections/server-test.ts'
import type { EditorSessions } from './editor/editor-sessions.ts'
import { ConnectionForms } from './form/connection-forms.ts'
import { registerHelpCommands } from './help/help-commands.ts'
import { registerQueryFeatures } from './query-features.ts'
import { createQueryServices, type WorkbenchContext } from './query-services.ts'
import { createServices, type Services, type StorageContext } from './services.ts'
import type { SessionManager } from './sessions/session-manager.ts'
import { readSettings } from './settings.ts'

type ActivationContext = Pick<vscode.ExtensionContext, 'extensionMode' | 'subscriptions'> &
  StorageContext &
  WorkbenchContext & {
    readonly extension: Pick<vscode.Extension<unknown>, 'id' | 'packageJSON'>
  }

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
    ...registerConnections(context.extensionUri, services, log),
    vscode.commands.registerCommand(CommandId.Hello, () => showGreeting(isDevelopment)),
    ...registerQueryFeatures(services, query, log),
    ...registerHelpCommands({
      extensionId: context.extension.id,
      extensionUri: context.extensionUri,
      packageJson: context.extension.packageJSON,
      log,
    }),
  )
  query.status.update()
  query.transactionStatus.update()
  openSessions = services.sessions
  editorSessions = query.editorSessions
  reportUnreadableConnections(services, log)
}

// The Connections view, the connection forms and their commands (phase 1).
function registerConnections(
  extensionUri: vscode.Uri,
  services: Services,
  log: vscode.LogOutputChannel,
): vscode.Disposable[] {
  const view = connectionsView(services)
  const forms = createForms(extensionUri, services, log)
  const commandContext = {
    ...services,
    log,
    forms,
    setViewMessage: (message: string) => {
      view.message = message
    },
  }
  return [
    view,
    forms,
    ...disposablesOf(services),
    ...registerConnectionCommands(commandContext),
    ...registerExplorerCommands(commandContext),
    ...registerFolderCommands(commandContext),
    ...registerFindCommands(commandContext),
    ...registerWriteAccessCommands({
      service: services.service,
      policy: () => readSettings().policy,
      log,
    }),
  ]
}

function connectionsView({ explorer }: Services): vscode.TreeView<unknown> {
  return vscode.window.createTreeView(ViewId.Connections, {
    treeDataProvider: explorer,
    showCollapseAll: true,
  })
}

function createForms(
  extensionUri: vscode.Uri,
  services: Services,
  log: vscode.LogOutputChannel,
): ConnectionForms {
  return new ConnectionForms({
    extensionUri,
    service: services.service,
    secrets: services.secrets,
    test: async (connection, secrets) =>
      pingServer({ open: services.open, log }, connection, secrets),
    listDatabases: async (connection, secrets) =>
      listServerDatabases({ open: services.open, log }, connection, secrets),
    policy: () => readSettings().policy,
    log,
  })
}

// VS Code waits for the sessions to close before it stops the extension host.
export async function deactivate(): Promise<void> {
  await Promise.all([openSessions?.disconnectAll(), editorSessions?.releaseAll()])
  openSessions = undefined
  editorSessions = undefined
}

// The services that go with the extension, and the explorer following the saved connections.
function disposablesOf({ explorer, sessions, store }: Services): vscode.Disposable[] {
  return [
    explorer,
    sessions,
    store,
    store.onDidChange(() => {
      explorer.refresh()
    }),
  ]
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
