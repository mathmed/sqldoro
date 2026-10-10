import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import {
  type CommandHarness,
  commandHarness,
  POSTGRES,
  saved,
} from '../../../test/support/commands.ts'
import {
  answerInputs,
  answerQuickPicks,
  labelOf,
  lastQuickPickItems,
} from '../../../test/support/prompts.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { type ConnectionConfig, newConnection } from '../../core/connection/connection.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import { CommandId } from '../command-id.ts'

const SHOP: ConnectionConfig = { ...newConnection('shop', POSTGRES), name: 'Shop', user: 'app' }

let harness: CommandHarness

beforeEach(() => {
  resetVscode()
  for (const prompt of [
    window.showQuickPick,
    window.showInputBox,
    window.showInformationMessage,
    window.showWarningMessage,
    window.showErrorMessage,
  ]) {
    prompt.mockReset()
  }
  harness = commandHarness()
})

afterEach(() => {
  harness.dispose()
})

describe('Add Connection', () => {
  it('should create a read-only connection for the chosen engine', async () => {
    answerQuickPicks('PostgreSQL', 'Name', 'User', 'Password', 'Save')
    answerInputs('Shop', 'app', 's3cret')

    await vscode.commands.executeCommand(CommandId.AddConnection)

    expect(harness.store.list()).toStrictEqual([
      { ...newConnection('id-1', POSTGRES), name: 'Shop', user: 'app' },
    ])
    expect(harness.storage.values).toStrictEqual(
      new Map([['sqldoro.connection.id-1.password', 's3cret']]),
    )
  })

  it('should do nothing when the engine or the form is dismissed', async () => {
    answerQuickPicks(undefined)
    await vscode.commands.executeCommand(CommandId.AddConnection)

    answerQuickPicks('MySQL', undefined)
    await vscode.commands.executeCommand(CommandId.AddConnection)

    expect(harness.store.list()).toStrictEqual([])
  })

  it('should say why it could not save, and log it', async () => {
    await harness.memento.update('sqldoro.connections', { version: 99, connections: [] })
    harness.dispose()
    harness = commandHarness({ memento: harness.memento })
    answerQuickPicks('PostgreSQL', 'Name', 'User', 'Save')
    answerInputs('Shop', 'app')

    await vscode.commands.executeCommand(CommandId.AddConnection)

    const message =
      'Add Connection failed: sqldoro cannot change the saved connections because it cannot read them: see the sqldoro output'
    expect(window.showErrorMessage).toHaveBeenCalledWith(message)
    expect(harness.log.error).toHaveBeenCalledWith(message)
  })
})

describe('Import Connection from URL', () => {
  it('should fill the form from the URL, keep its password secret and warn about what it ignored', async () => {
    answerInputs('postgresql://app:pa55@db.example.com/shop?connect_timeout=5')
    answerQuickPicks('Save')

    await vscode.commands.executeCommand(CommandId.ImportConnectionUrl)

    expect(window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({
        password: true,
        prompt:
          'A mysql://, postgres://, postgresql:// URL. The password it holds goes to the VS Code secret storage.',
      }),
    )
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Ignored the URL parameter "connect_timeout"',
    )
    expect(harness.store.list()).toMatchObject([
      {
        id: 'id-1',
        name: 'db.example.com/shop',
        engine: 'postgres',
        host: 'db.example.com',
        user: 'app',
      },
    ])
    expect(harness.storage.values).toStrictEqual(
      new Map([['sqldoro.connection.id-1.password', 'pa55']]),
    )
  })

  it('should import a URL without a password or warnings', async () => {
    answerInputs('mysql://root@localhost/app')
    answerQuickPicks('Save')

    await vscode.commands.executeCommand(CommandId.ImportConnectionUrl)

    expect(window.showWarningMessage).not.toHaveBeenCalled()
    expect(harness.storage.values.size).toBe(0)
  })

  it('should explain why a URL cannot be imported', async () => {
    answerInputs('mongodb://db')

    await vscode.commands.executeCommand(CommandId.ImportConnectionUrl)

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Cannot import this URL: Unsupported URL scheme "mongodb": use mysql://, postgres:// or postgresql://',
    )
  })

  it('should do nothing when the URL prompt is dismissed', async () => {
    answerInputs(undefined)

    await vscode.commands.executeCommand(CommandId.ImportConnectionUrl)

    expect(harness.store.list()).toStrictEqual([])
  })
})

describe('Edit Connection', () => {
  it('should edit the connection of a tree node and show which secrets are stored', async () => {
    await saved(harness, SHOP, new Map([[SecretKind.Password, 's3cret']]))
    answerQuickPicks('Host', 'Save')
    answerInputs('db.example.com')

    await vscode.commands.executeCommand(CommandId.EditConnection, { connectionId: 'shop' })

    expect(harness.store.find('shop')?.host).toBe('db.example.com')
    expect(lastQuickPickItems().find((item) => labelOf(item) === 'Password')?.description).toBe(
      'stored',
    )
  })

  it('should let the user pick the connection from the Command Palette', async () => {
    await saved(harness, SHOP)
    answerQuickPicks('Shop', 'Save')

    await vscode.commands.executeCommand(CommandId.EditConnection)

    expect(window.showQuickPick).toHaveBeenCalledWith(
      [{ label: 'Shop', description: 'localhost', value: SHOP }],
      { title: 'Edit Connection', ignoreFocusOut: true },
    )
  })

  it('should say there is nothing to edit yet', async () => {
    await vscode.commands.executeCommand(CommandId.EditConnection)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'There is no connection yet: add one first.',
    )
  })

  it('should do nothing for a connection that no longer exists or a dismissed pick', async () => {
    await saved(harness, SHOP)
    answerQuickPicks(undefined)

    await vscode.commands.executeCommand(CommandId.EditConnection, 'gone')
    await vscode.commands.executeCommand(CommandId.EditConnection, { connectionId: 7 })

    expect(harness.store.list()).toStrictEqual([SHOP])
  })
})

describe('Duplicate Connection', () => {
  it('should copy the connection and say how the copy is named', async () => {
    await saved(harness, SHOP)

    await vscode.commands.executeCommand(CommandId.DuplicateConnection, 'shop')

    expect(harness.store.list().map((connection) => connection.name)).toStrictEqual([
      'Shop',
      'Shop (copy)',
    ])
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Duplicated "Shop" as "Shop (copy)".',
    )
  })

  it('should do nothing without a connection', async () => {
    await vscode.commands.executeCommand(CommandId.DuplicateConnection, 'gone')

    expect(harness.store.list()).toStrictEqual([])
  })
})

describe('Delete Connection', () => {
  it('should delete the connection and its secrets once the user confirms', async () => {
    await saved(harness, SHOP, new Map([[SecretKind.Password, 's3cret']]))
    window.showWarningMessage.mockResolvedValueOnce('Delete')

    await vscode.commands.executeCommand(CommandId.DeleteConnection, 'shop')

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Delete the connection "Shop"?',
      { modal: true, detail: 'Its saved password and passphrase are deleted too.' },
      'Delete',
    )
    expect(harness.store.list()).toStrictEqual([])
    expect(harness.storage.values.size).toBe(0)
  })

  it('should keep the connection when the user does not confirm', async () => {
    await saved(harness, SHOP)
    window.showWarningMessage.mockResolvedValueOnce(undefined)

    await vscode.commands.executeCommand(CommandId.DeleteConnection, 'shop')
    await vscode.commands.executeCommand(CommandId.DeleteConnection, 'gone')

    expect(harness.store.list()).toStrictEqual([SHOP])
  })
})

describe('Test Connection', () => {
  it('should connect with the saved secrets, report the server and close the session', async () => {
    await saved(harness, SHOP, new Map([[SecretKind.Password, 's3cret']]))

    await vscode.commands.executeCommand(CommandId.TestConnection, 'shop')

    expect(harness.requests[0]).toMatchObject({
      connection: SHOP,
      secrets: new Map([[SecretKind.Password, 's3cret']]),
    })
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Connected to "Shop": PostgreSQL 18.6.',
    )
    expect(harness.close).toHaveBeenCalledOnce()
    harness.requests[0]?.onUnexpectedClose(new Error('late'))
    expect(harness.log.debug).toHaveBeenCalledWith('The test session of Shop ended: late')
  })

  it('should show why the test failed', async () => {
    harness.dispose()
    harness = commandHarness({ openError: new Error('password authentication failed') })
    await saved(harness, SHOP)

    await vscode.commands.executeCommand(CommandId.TestConnection, 'shop')

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Could not connect to "Shop": password authentication failed',
    )
  })

  it('should test the connection being edited with the secrets typed in the form', async () => {
    await saved(harness, SHOP, new Map([[SecretKind.Password, 'old']]))
    answerQuickPicks('Password', 'Enter a new password', 'Test Connection', undefined)
    answerInputs('new')

    await vscode.commands.executeCommand(CommandId.EditConnection, 'shop')

    expect(harness.requests[0]?.secrets).toStrictEqual(new Map([[SecretKind.Password, 'new']]))
  })

  it('should do nothing without a connection', async () => {
    await vscode.commands.executeCommand(CommandId.TestConnection, 'gone')

    expect(harness.requests).toStrictEqual([])
  })
})
