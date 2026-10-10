import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import {
  type CommandHarness,
  commandHarness,
  POSTGRES,
  saved,
} from '../../../test/support/commands.ts'
import {
  formPanels,
  fromForm,
  lastFormPanel,
  openForm,
  sentToForm,
  settled,
  setupOf,
} from '../../../test/support/forms.ts'
import { answerQuickPicks } from '../../../test/support/prompts.ts'
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
  it('should open the form of a new connection on the engines, without asking anything', async () => {
    const { panel, answer } = await openForm(
      vscode.commands.executeCommand(CommandId.AddConnection),
    )

    expect(answer).toBe(true)
    expect(window.showQuickPick).not.toHaveBeenCalled()
    expect(panel.title).toBe('New Connection')
    expect(setupOf(panel)).toMatchObject({
      mode: 'new',
      start: 'picker',
      connection: { id: 'id-1', engine: 'mysql', port: 3306, isReadOnly: true },
      heldSecrets: [],
      engines: [
        { id: 'mysql', displayName: 'MySQL', defaultPort: 3306 },
        { id: 'postgres', displayName: 'PostgreSQL', defaultPort: 5432 },
      ],
    })
  })

  it('should save what the form sends, close it and say so', async () => {
    const { panel } = await openForm(vscode.commands.executeCommand(CommandId.AddConnection))
    const connection = { ...newConnection('id-1', POSTGRES), name: 'Shop', user: 'app' }

    await fromForm(panel, {
      type: 'save',
      draft: { connection, secretChanges: [{ kind: 'password', value: 's3cret' }] },
    })

    expect(harness.store.list()).toStrictEqual([connection])
    expect(harness.storage.values).toStrictEqual(
      new Map([['sqldoro.connection.id-1.password', 's3cret']]),
    )
    expect(panel.isDisposed).toBe(true)
    expect(window.showInformationMessage).toHaveBeenCalledWith('Saved the connection "Shop".')
  })

  it('should bring back the form already open instead of a new one', async () => {
    const { panel } = await openForm(vscode.commands.executeCommand(CommandId.AddConnection))

    await expect(vscode.commands.executeCommand(CommandId.AddConnection)).resolves.toBe(true)

    expect(formPanels()).toStrictEqual([panel])
    expect(panel.reveal).toHaveBeenCalledOnce()
    await fromForm(panel, { type: 'cancel' })
    await openForm(vscode.commands.executeCommand(CommandId.AddConnection))
    expect(setupOf(lastFormPanel())).toMatchObject({ connection: { id: 'id-2' } })
  })

  it('should answer false when the form is closed before it loads', async () => {
    const shown = vscode.commands.executeCommand(CommandId.AddConnection)
    await settled()

    lastFormPanel().dispose()

    await expect(shown).resolves.toBe(false)
  })
})

describe('Import Connection from URL', () => {
  it('should open the form of a new connection on the input of a connection string', async () => {
    const { panel, answer } = await openForm(
      vscode.commands.executeCommand(CommandId.ImportConnectionUrl),
    )

    expect(answer).toBe(true)
    expect(window.showInputBox).not.toHaveBeenCalled()
    expect(panel.title).toBe('New Connection')
    expect(setupOf(panel)).toMatchObject({ mode: 'new', start: 'import', heldSecrets: [] })
    expect(sentToForm(panel, 'showImport')).toStrictEqual([])
  })

  it('should bring back the form of a new connection with the input open', async () => {
    const { panel } = await openForm(vscode.commands.executeCommand(CommandId.AddConnection))

    await expect(vscode.commands.executeCommand(CommandId.ImportConnectionUrl)).resolves.toBe(true)

    expect(formPanels()).toStrictEqual([panel])
    expect(panel.reveal).toHaveBeenCalledOnce()
    expect(sentToForm(panel, 'showImport')).toStrictEqual([{ type: 'showImport' }])
  })

  it('should save the password of the URL pasted in the form, never sending it there', async () => {
    const { panel } = await openForm(vscode.commands.executeCommand(CommandId.ImportConnectionUrl))

    await fromForm(panel, { type: 'import', text: 'postgresql://app:pa55@db.example.com/shop' })
    const [imported] = sentToForm(panel, 'imported')
    await fromForm(panel, {
      type: 'save',
      draft: { connection: imported?.['connection'], secretChanges: [] },
    })

    expect(harness.store.list()).toMatchObject([{ id: 'id-1', name: 'db.example.com/shop' }])
    expect(harness.storage.values).toStrictEqual(
      new Map([['sqldoro.connection.id-1.password', 'pa55']]),
    )
    expect(JSON.stringify(panel.webview.posted)).not.toContain('pa55')
  })
})

describe('Edit Connection', () => {
  it('should open the form of a tree node with its values and which secrets are stored', async () => {
    await saved(harness, SHOP, new Map([[SecretKind.Password, 's3cret']]))

    const { panel, answer } = await openForm(
      vscode.commands.executeCommand(CommandId.EditConnection, { connectionId: 'shop' }),
    )
    await fromForm(panel, {
      type: 'save',
      draft: { connection: { ...SHOP, host: 'db.example.com' }, secretChanges: [] },
    })

    expect(answer).toBe(true)
    expect(panel.title).toBe('Edit Connection: Shop')
    expect(setupOf(panel)).toMatchObject({
      mode: 'edit',
      connection: SHOP,
      heldSecrets: ['password'],
    })
    expect(JSON.stringify(panel.webview.posted)).not.toContain('s3cret')
    expect(harness.store.find('shop')?.host).toBe('db.example.com')
    expect(harness.storage.values.get('sqldoro.connection.shop.password')).toBe('s3cret')
  })

  it('should bring back the form of a connection already open', async () => {
    await saved(harness, SHOP)
    const { panel } = await openForm(
      vscode.commands.executeCommand(CommandId.EditConnection, 'shop'),
    )

    await vscode.commands.executeCommand(CommandId.EditConnection, 'shop')

    expect(formPanels()).toStrictEqual([panel])
    expect(panel.reveal).toHaveBeenCalledOnce()
  })

  it('should let the user pick the connection from the Command Palette', async () => {
    await saved(harness, SHOP)
    answerQuickPicks('Shop')

    const { panel } = await openForm(vscode.commands.executeCommand(CommandId.EditConnection))

    expect(window.showQuickPick).toHaveBeenCalledWith(
      [{ label: 'Shop', description: 'localhost', value: SHOP }],
      { title: 'Edit Connection', ignoreFocusOut: true },
    )
    expect(setupOf(panel)).toMatchObject({ connection: SHOP })
  })

  it('should say there is nothing to edit yet', async () => {
    await expect(vscode.commands.executeCommand(CommandId.EditConnection)).resolves.toBe(false)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'There is no connection yet: add one first.',
    )
  })

  it('should do nothing for a connection that no longer exists or a dismissed pick', async () => {
    await saved(harness, SHOP)
    answerQuickPicks(undefined)

    await vscode.commands.executeCommand(CommandId.EditConnection, 'gone')
    await vscode.commands.executeCommand(CommandId.EditConnection, { connectionId: 7 })

    expect(formPanels()).toStrictEqual([])
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

  it('should test the connection of a form with the secrets typed in it', async () => {
    await saved(harness, SHOP, new Map([[SecretKind.Password, 'old']]))
    const { panel } = await openForm(
      vscode.commands.executeCommand(CommandId.EditConnection, 'shop'),
    )

    await fromForm(panel, {
      type: 'test',
      draft: { connection: SHOP, secretChanges: [{ kind: 'password', value: 'new' }] },
    })

    expect(harness.requests[0]?.secrets).toStrictEqual(new Map([[SecretKind.Password, 'new']]))
    expect(sentToForm(panel, 'tested')).toStrictEqual([
      { type: 'tested', isSuccess: true, message: 'Connected: PostgreSQL 18.6' },
    ])
    expect(window.showInformationMessage).not.toHaveBeenCalled()
  })

  it('should list the databases of the server of a form in a session it closes again', async () => {
    await saved(harness, SHOP)
    const { panel } = await openForm(
      vscode.commands.executeCommand(CommandId.EditConnection, 'shop'),
    )

    await fromForm(panel, { type: 'listDatabases', draft: { connection: SHOP, secretChanges: [] } })

    expect(sentToForm(panel, 'databases')).toStrictEqual([{ type: 'databases', names: [] }])
    expect(harness.requests).toHaveLength(1)
    expect(harness.close).toHaveBeenCalledOnce()
  })

  it('should do nothing without a connection', async () => {
    await vscode.commands.executeCommand(CommandId.TestConnection, 'gone')

    expect(harness.requests).toStrictEqual([])
  })
})
