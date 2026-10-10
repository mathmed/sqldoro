import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import {
  applySecretChanges,
  type ConnectionSecrets,
  SecretKind,
} from '../../core/connection/secrets.ts'
import { describeError } from '../../core/text/errors.ts'
import { CommandId } from '../command-id.ts'
import { runConnectionForm } from '../form/connection-form.ts'
import type { FormDraft } from '../form/form-draft.ts'
import { askChoice, askText } from '../form/prompts.ts'
import { type CommandContext, connectionFrom, registerAll } from './command-context.ts'

const DELETE = 'Delete'

export function registerConnectionCommands(context: CommandContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.AddConnection, action: 'Add Connection', run: addConnection },
    { id: CommandId.ImportConnectionUrl, action: 'Import Connection', run: importConnectionUrl },
    { id: CommandId.EditConnection, action: 'Edit Connection', run: editConnection },
    { id: CommandId.DuplicateConnection, action: 'Duplicate Connection', run: duplicateConnection },
    { id: CommandId.DeleteConnection, action: 'Delete Connection', run: deleteConnection },
    { id: CommandId.TestConnection, action: 'Test Connection', run: testSavedConnection },
  ])
}

async function addConnection(context: CommandContext): Promise<void> {
  const engines = context.service.engines.engines
  const engineId = await askChoice(
    'Add Connection: choose the database',
    engines.map((engine) => ({ label: engine.displayName, value: engine.id })),
  )
  if (engineId !== undefined) {
    await editAndSave(
      context,
      newDraft(context.service.draft(engineId), new Map()),
      'Add Connection',
    )
  }
}

async function importConnectionUrl(context: CommandContext): Promise<void> {
  const schemes = context.service.engines.urlSchemes.map((scheme) => `${scheme}://`).join(', ')
  const url = await askText({
    title: 'Import Connection from URL',
    prompt: `A ${schemes} URL. The password it holds goes to the VS Code secret storage.`,
    value: '',
    placeHolder: 'postgres://user:password@host:5432/database?sslmode=require',
    isPassword: true,
  })
  if (url === undefined) {
    return
  }
  const result = context.service.importUrl(url)
  if (!result.isValid) {
    void vscode.window.showErrorMessage(`Cannot import this URL: ${result.message}`)
    return
  }
  const { connection, password, warnings } = result.imported
  if (warnings.length > 0) {
    void vscode.window.showWarningMessage(warnings.join('. '))
  }
  const secrets = password === '' ? new Map() : new Map([[SecretKind.Password, password]])
  await editAndSave(context, newDraft(connection, secrets), 'Import Connection from URL')
}

async function editConnection(context: CommandContext, target: unknown): Promise<void> {
  const connection = await connectionFrom(target, context, 'Edit Connection')
  if (connection !== undefined) {
    const draft = {
      connection,
      secretChanges: new Map(),
      storedSecrets: await context.secrets.storedKinds(connection),
    }
    await editAndSave(context, draft, `Edit Connection: ${connection.name}`)
  }
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

function newDraft(
  connection: ConnectionConfig,
  secretChanges: ReadonlyMap<SecretKind, string>,
): FormDraft {
  return { connection, secretChanges, storedSecrets: new Set() }
}

async function editAndSave(
  context: CommandContext,
  draft: FormDraft,
  title: string,
): Promise<void> {
  const result = await runConnectionForm(draft, {
    title,
    engines: context.service.engines,
    validate: (connection) => context.service.validate(connection),
    test: async (edited) =>
      testConnection(
        context,
        edited.connection,
        applySecretChanges(await context.secrets.read(edited.connection), edited.secretChanges),
      ),
  })
  if (result !== undefined) {
    await context.service.save(result.connection, result.secretChanges)
  }
}

// Opens a session, pings the server and closes it again: the saved connection is not changed.
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

async function pingServer(
  context: CommandContext,
  connection: ConnectionConfig,
  secrets: ConnectionSecrets,
): Promise<string> {
  const session = await context.open({
    connection,
    secrets,
    onUnexpectedClose: (error) => {
      context.log.debug(`The test session of ${connection.name} ended: ${describeError(error)}`)
    },
  })
  try {
    await session.engineSession.ping()
    return `${session.engine.displayName} ${session.engineSession.serverVersion}`
  } finally {
    await session.close()
  }
}
