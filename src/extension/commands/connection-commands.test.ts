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
import { answerInputs, answerQuickPicks } from '../../../test/support/prompts.ts'
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
  it('should open the form of a new connection on the first engine, without asking anything', async () => {
    const { panel, answer } = await openForm(
      vscode.commands.executeCommand(CommandId.AddConnection),
    )

    expect(answer).toBe(true)
    expect(window.showQuickPick).not.toHaveBeenCalled()
    expect(panel.title).toBe('New Connection')
    expect(setupOf(panel)).toMatchObject({
      mode: 'new',
      connection: { id: 'id-1', engine: 'mysql', port: 3306, isReadOnly: true },
      heldSecrets: [],
      engines: [
        { id: 'mysql', displayName: 'MySQL', defaultPort: 3306 },
        { id: 'postgres', displayName: 'PostgreSQL', defaultPort: 5432 },
      ],
      notices: [],
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
  it('should open the form with what the URL holds, its warnings and its password kept back', async () => {
    answerInputs('postgresql://app:pa55@db.example.com/shop?connect_timeout=5')

    const { panel, answer } = await openForm(
      vscode.commands.executeCommand(CommandId.ImportConnectionUrl),
    )

    expect(answer).toBe(true)
    expect(window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({
        password: true,
        prompt:
          'A mysql://, postgres://, postgresql:// URL. The password it holds goes to the VS Code secret storage.',
      }),
    )
    expect(window.showWarningMessage).not.toHaveBeenCalled()
    expect(setupOf(panel)).toMatchObject({
      mode: 'new',
      connection: { id: 'id-1', name: 'db.example.com/shop', host: 'db.example.com', user: 'app' },
      heldSecrets: ['password'],
      notices: ['Ignored the URL parameter "connect_timeout"'],
    })
    expect(JSON.stringify(panel.webview.posted)).not.toContain('pa55')
  })

  it('should save the password of the URL unless the form replaces it', async () => {
    answerInputs('postgresql://app:pa55@db.example.com/shop', 'mysql://root:pw@localhost/app')
    const first = await openForm(vscode.commands.executeCommand(CommandId.ImportConnectionUrl))
    const second = await openForm(vscode.commands.executeCommand(CommandId.ImportConnectionUrl))
    const [one, two] = [first, second].map(({ panel }) => setupOf(panel)['connection'])

    await fromForm(first.panel, { type: 'save', draft: { connection: one, secretChanges: [] } })
    await fromForm(second.panel, {
      type: 'save',
      draft: { connection: two, secretChanges: [{ kind: 'password', value: 'typed' }] },
    })

    expect(harness.storage.values).toStrictEqual(
      new Map([
        ['sqldoro.connection.id-1.password', 'pa55'],
        ['sqldoro.connection.id-2.password', 'typed'],
      ]),
    )
  })

  it('should import a URL without a password or warnings', async () => {
    answerInputs('mysql://root@localhost/app')

    const { panel } = await openForm(vscode.commands.executeCommand(CommandId.ImportConnectionUrl))

    expect(setupOf(panel)).toMatchObject({ heldSecrets: [], notices: [] })
  })

  it('should explain why a URL cannot be imported', async () => {
    answerInputs('mongodb://db')

    await expect(vscode.commands.executeCommand(CommandId.ImportConnectionUrl)).resolves.toBe(false)

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Cannot import this URL: Unsupported URL scheme "mongodb": use mysql://, postgres:// or postgresql://',
    )
    expect(formPanels()).toStrictEqual([])
  })

  it('should do nothing when the URL prompt is dismissed', async () => {
    answerInputs(undefined)

    await expect(vscode.commands.executeCommand(CommandId.ImportConnectionUrl)).resolves.toBe(false)

    expect(formPanels()).toStrictEqual([])
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

  it('should do nothing without a connection', async () => {
    await vscode.commands.executeCommand(CommandId.TestConnection, 'gone')

    expect(harness.requests).toStrictEqual([])
  })
})
