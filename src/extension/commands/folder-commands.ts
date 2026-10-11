import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import {
  connectionFolders,
  deletedFolder,
  folderProblem,
  renamedFolder,
} from '../../core/connection/folders.ts'
import { normalizeFolder } from '../../core/text/folder-paths.ts'
import { CommandId } from '../command-id.ts'
import { askChoice, askText } from '../form/prompts.ts'
import { isFolderNode } from '../tree/explorer-node.ts'
import { type CommandContext, connectionFrom, registerAll } from './command-context.ts'

// The choices of Move to Folder that are not folders.
const NO_FOLDER = Symbol('no folder')
const NEW_FOLDER = Symbol('new folder')

// Folders group the connections of the Connections view; they hold nothing of their own, so
// renaming or deleting one only moves the connections inside it.
export function registerFolderCommands(context: CommandContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.MoveToFolder, action: 'Move to Folder', run: moveToFolder },
    { id: CommandId.RenameFolder, action: 'Rename Folder', run: renameFolder },
    { id: CommandId.DeleteFolder, action: 'Delete Folder', run: deleteFolder },
  ])
}

async function moveToFolder(context: CommandContext, target: unknown): Promise<void> {
  const connection = await connectionFrom(target, context, 'Move a Connection to a Folder')
  const folder = connection === undefined ? undefined : await askFolder(context, connection)
  if (connection !== undefined && folder !== undefined) {
    await context.service.save({ ...connection, folder }, new Map())
  }
}

// The folders there are, no folder, or a new one typed; undefined when the user dismissed it.
async function askFolder(
  context: CommandContext,
  connection: ConnectionConfig,
): Promise<string | undefined> {
  const choice = await askChoice<string | symbol>(`Move "${connection.name}" to a Folder`, [
    ...connectionFolders(context.service.list()).map((folder) => ({
      label: folder,
      value: folder,
    })),
    { label: '$(add) New Folder…', value: NEW_FOLDER },
    { label: '$(close) No Folder', value: NO_FOLDER },
  ])
  if (typeof choice === 'string' || choice === undefined) {
    return choice
  }
  return choice === NO_FOLDER ? '' : askFolderName('New Folder', connection.folder)
}

async function askFolderName(title: string, value: string): Promise<string | undefined> {
  const typed = await askText({
    title,
    prompt: 'The folder, with / between nested folders: clients/acme',
    value,
    placeHolder: 'clients/acme',
    validate: (text) =>
      normalizeFolder(text) === '' ? 'Enter the name of the folder' : folderProblem(text),
  })
  return typed === undefined ? undefined : normalizeFolder(typed)
}

async function renameFolder(context: CommandContext, target: unknown): Promise<void> {
  const from = await folderFrom(context, target, 'Rename a Folder')
  const to = from === undefined ? undefined : await askFolderName(`Rename "${from}"`, from)
  if (from !== undefined && to !== undefined && to !== from) {
    await saveAll(context, renamedFolder(context.service.list(), { from, to }))
  }
}

async function deleteFolder(context: CommandContext, target: unknown): Promise<void> {
  const folder = await folderFrom(context, target, 'Delete a Folder')
  if (folder !== undefined) {
    await saveAll(context, deletedFolder(context.service.list(), folder))
    void vscode.window.showInformationMessage(
      `The folder "${folder}" is gone; its connections are still there.`,
    )
  }
}

async function saveAll(
  context: CommandContext,
  connections: readonly ConnectionConfig[],
): Promise<void> {
  for (const connection of connections) {
    await context.service.save(connection, new Map())
  }
}

// The folder of the node the command was run on; from the Command Palette, the user picks one.
async function folderFrom(
  context: CommandContext,
  target: unknown,
  title: string,
): Promise<string | undefined> {
  if (isFolderNode(target)) {
    return target.place?.name
  }
  const folders = connectionFolders(context.service.list())
  if (folders.length === 0) {
    void vscode.window.showInformationMessage('There is no folder yet: Move to Folder makes one.')
    return undefined
  }
  return askChoice(
    title,
    folders.map((folder) => ({ label: folder, value: folder })),
  )
}
