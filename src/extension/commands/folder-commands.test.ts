import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import {
  type CommandHarness,
  commandHarness,
  POSTGRES,
  saved,
} from '../../../test/support/commands.ts'
import { answerInputs, answerQuickPicks } from '../../../test/support/prompts.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { type ConnectionConfig, newConnection } from '../../core/connection/connection.ts'
import { CommandId } from '../command-id.ts'

const SHOP: ConnectionConfig = { ...newConnection('shop', POSTGRES), name: 'Shop', user: 'app' }
const ACME: ConnectionConfig = {
  ...newConnection('acme', POSTGRES),
  name: 'Acme',
  user: 'app',
  folder: 'clients/acme',
}
const BETA: ConnectionConfig = {
  ...newConnection('beta', POSTGRES),
  name: 'Beta',
  user: 'app',
  folder: 'clients',
}

let harness: CommandHarness

function folderOf(id: string): string | undefined {
  return harness.store.list().find((connection) => connection.id === id)?.folder
}

function folderNode(path: string): unknown {
  return { kind: 'folder', connectionId: '', place: { database: '', schema: '', name: path } }
}

beforeEach(async () => {
  resetVscode()
  for (const prompt of [window.showQuickPick, window.showInputBox, window.showInformationMessage]) {
    prompt.mockReset()
  }
  harness = commandHarness()
  await saved(harness, SHOP)
  await saved(harness, ACME)
  await saved(harness, BETA)
})

afterEach(() => {
  harness.dispose()
})

describe('Move to Folder', () => {
  it('should move a connection to a new folder, typed with / between nested folders', async () => {
    answerQuickPicks('New Folder…')
    answerInputs(' team / ops / ')

    await vscode.commands.executeCommand(CommandId.MoveToFolder, { connectionId: 'shop' })

    expect(folderOf('shop')).toBe('team/ops')
  })

  it('should offer the folders there are, and taking a connection out of its folder', async () => {
    answerQuickPicks('clients/acme', 'No Folder')

    await vscode.commands.executeCommand(CommandId.MoveToFolder, { connectionId: 'shop' })
    expect(folderOf('shop')).toBe('clients/acme')
    await vscode.commands.executeCommand(CommandId.MoveToFolder, { connectionId: 'acme' })

    expect(folderOf('acme')).toBe('')
    expect(window.showQuickPick.mock.calls[0]?.[0]).toMatchObject([
      { label: 'clients' },
      { label: 'clients/acme' },
      { label: '$(add) New Folder…' },
      { label: '$(close) No Folder' },
    ])
  })

  it('should leave the connection where it was when the user changes their mind', async () => {
    answerQuickPicks(undefined, 'New Folder…', undefined)
    answerInputs(undefined)

    await vscode.commands.executeCommand(CommandId.MoveToFolder, { connectionId: 'acme' })
    await vscode.commands.executeCommand(CommandId.MoveToFolder, { connectionId: 'acme' })
    await vscode.commands.executeCommand(CommandId.MoveToFolder)

    expect(folderOf('acme')).toBe('clients/acme')
  })

  it('should refuse a folder without a name', async () => {
    const problems: unknown[] = []
    answerQuickPicks('New Folder…')
    window.showInputBox.mockImplementation(
      async (options: { readonly validateInput: (value: string) => unknown }) => {
        problems.push(options.validateInput(' / '), options.validateInput('team/ops'))
        return Promise.resolve(undefined)
      },
    )

    await vscode.commands.executeCommand(CommandId.MoveToFolder, { connectionId: 'shop' })

    expect(problems).toStrictEqual(['Enter the name of the folder', undefined])
    expect(folderOf('shop')).toBe('')
  })
})

describe('Rename Folder', () => {
  it('should move the connections of a folder, and of the folders inside it', async () => {
    answerInputs('customers')

    await vscode.commands.executeCommand(CommandId.RenameFolder, folderNode('clients'))

    expect(folderOf('beta')).toBe('customers')
    expect(folderOf('acme')).toBe('customers/acme')
    expect(folderOf('shop')).toBe('')
  })

  it('should let the user pick the folder from the Command Palette', async () => {
    answerQuickPicks('clients/acme')
    answerInputs('clients/acme corp')

    await vscode.commands.executeCommand(CommandId.RenameFolder)

    expect(folderOf('acme')).toBe('clients/acme corp')
  })

  it('should change nothing for the same name, or a dismissed prompt', async () => {
    answerInputs('clients', undefined)
    answerQuickPicks(undefined)

    await vscode.commands.executeCommand(CommandId.RenameFolder, folderNode('clients'))
    await vscode.commands.executeCommand(CommandId.RenameFolder, folderNode('clients'))
    await vscode.commands.executeCommand(CommandId.RenameFolder)

    expect(folderOf('acme')).toBe('clients/acme')
  })
})

describe('Delete Folder', () => {
  it('should take the connections out of the folder and keep them', async () => {
    await vscode.commands.executeCommand(CommandId.DeleteFolder, folderNode('clients'))

    expect(folderOf('beta')).toBe('')
    expect(folderOf('acme')).toBe('acme')
    expect(harness.store.list()).toHaveLength(3)
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'The folder "clients" is gone; its connections are still there.',
    )
  })

  it('should say that there is no folder yet', async () => {
    harness.dispose()
    harness = commandHarness()
    await saved(harness, SHOP)

    await vscode.commands.executeCommand(CommandId.DeleteFolder)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'There is no folder yet: Move to Folder makes one.',
    )
    expect(window.showQuickPick).not.toHaveBeenCalled()
  })

  it('should do nothing when the pick is dismissed', async () => {
    answerQuickPicks(undefined)

    await vscode.commands.executeCommand(CommandId.DeleteFolder)

    expect(folderOf('acme')).toBe('clients/acme')
  })
})
