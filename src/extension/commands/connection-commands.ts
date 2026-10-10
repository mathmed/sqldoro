import * as vscode from 'vscode'

import { FormMode, FormStart } from '../../core/connection-form/protocol.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ConnectionSecrets } from '../../core/connection/secrets.ts'
import { describeError } from '../../core/text/errors.ts'
import { CommandId } from '../command-id.ts'
import { pingServer } from '../connections/server-test.ts'
import type { ConnectionFormPanel } from '../form/connection-form-panel.ts'
import type { ConnectionForms } from '../form/connection-forms.ts'
import type { FormRequest } from '../form/form-request.ts'
import { withTimeout } from '../platform/timeout.ts'
import { type CommandContext, connectionFrom, registerAll } from './command-context.ts'

export interface ConnectionCommandContext extends CommandContext {
  readonly forms: ConnectionForms
}

const DELETE = 'Delete'
// A form must load in this time to count as open (the smoke test waits for it).
const LOAD_TIMEOUT_MS = 30_000

export function registerConnectionCommands(context: ConnectionCommandContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.AddConnection, action: 'Add Connection', run: addConnection },
    { id: CommandId.ImportConnectionUrl, action: 'Import Connection', run: importConnectionUrl },
    { id: CommandId.EditConnection, action: 'Edit Connection', run: editConnection },
    { id: CommandId.DuplicateConnection, action: 'Duplicate Connection', run: duplicateConnection },
    { id: CommandId.DeleteConnection, action: 'Delete Connection', run: deleteConnection },
    { id: CommandId.TestConnection, action: 'Test Connection', run: testSavedConnection },
  ])
}

// The commands that open a form answer true once it has loaded, false when it was closed first.
async function loaded(form: ConnectionFormPanel): Promise<boolean> {
  return withTimeout(form.whenLoaded, LOAD_TIMEOUT_MS, 'The connection form did not load')
}

function newRequest(context: ConnectionCommandContext, start: FormStart): FormRequest {
  return {
    mode: FormMode.New,
    start,
    connection: context.service.draft(),
    storedSecrets: new Set(),
  }
}

// The form of a new connection opens on the engines to choose from.
async function addConnection(context: ConnectionCommandContext): Promise<boolean> {
  return loaded(context.forms.openNew(() => newRequest(context, FormStart.Picker)))
}

// The connection string is pasted in the form of a new connection, which comes back if it is open:
// its password stays in the extension until the connection is saved.
async function importConnectionUrl(context: ConnectionCommandContext): Promise<boolean> {
  const form = context.forms.openNew(() => newRequest(context, FormStart.Import))
  form.showImport()
  return loaded(form)
}

async function editConnection(
  context: ConnectionCommandContext,
  target: unknown,
): Promise<boolean> {
  const connection = await connectionFrom(target, context, 'Edit Connection')
  if (connection === undefined) {
    return false
  }
  const storedSecrets = await context.secrets.storedKinds(connection)
  return loaded(
    context.forms.open({
      mode: FormMode.Edit,
      start: FormStart.Details,
      connection,
      storedSecrets,
    }),
  )
}

async function duplicateConnection(context: CommandContext, target: unknown): Promise<void> {
  const connection = await connectionFrom(target, context, 'Duplicate Connection')
  if (connection !== undefined) {
    const copy = await context.service.duplicate(connection)
    void vscode.window.showInformationMessage(`Duplicated "${connection.name}" as "${copy.name}".`)
  }
}

async function deleteConnection(context: CommandContext, target: unknown): Promise<void> {
  const connection = await connectionFrom(target, context, 'Delete Connection')
  if (connection === undefined) {
    return
  }
  const choice = await vscode.window.showWarningMessage(
    `Delete the connection "${connection.name}"?`,
    { modal: true, detail: 'Its saved password and passphrase are deleted too.' },
    DELETE,
  )
  if (choice === DELETE) {
    await context.service.delete(connection.id)
  }
}

async function testSavedConnection(context: CommandContext, target: unknown): Promise<void> {
  const connection = await connectionFrom(target, context, 'Test Connection')
  if (connection !== undefined) {
    await testConnection(context, connection, await context.secrets.read(connection))
  }
}

async function testConnection(
  context: CommandContext,
  connection: ConnectionConfig,
  secrets: ConnectionSecrets,
): Promise<void> {
  try {
    const server = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Testing the connection to "${connection.name}"…`,
      },
      async () => pingServer(context, connection, secrets),
    )
    void vscode.window.showInformationMessage(`Connected to "${connection.name}": ${server}.`)
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Could not connect to "${connection.name}": ${describeError(error)}`,
    )
  }
}
