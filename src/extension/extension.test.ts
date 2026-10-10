import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import manifest from '../../package.json' with { type: 'json' }
import { FakeMemento, FakeSecretStorage } from '../../test/fakes/extension-context.ts'
import { formPanels, fromForm, openForm, sentToForm } from '../../test/support/forms.ts'
import { outputChannels, resetVscode, treeViews, window } from '../../test/vscode.ts'
import { CommandId, ViewId } from './command-id.ts'
import { activate, deactivate } from './extension.ts'

const subscriptions: vscode.Disposable[] = []
const SAVED_CONNECTION = {
  id: 'shop',
  name: 'Shop',
  engine: 'postgres',
  host: 'localhost',
  port: 5432,
  user: 'app',
  database: '',
  ssl: { mode: 'disable', caPath: '', certPath: '', keyPath: '', shouldRejectUnauthorized: true },
  environment: 'none',
  isReadOnly: true,
}

function activateIn(extensionMode: vscode.ExtensionMode, globalState = new FakeMemento()): void {
  activate({
    extensionMode,
    subscriptions,
    globalState,
    workspaceState: new FakeMemento(),
    secrets: new FakeSecretStorage(),
    extensionUri: vscode.Uri.file('/extension'),
  })
}

function disposeSubscriptions(): void {
  for (const subscription of subscriptions.splice(0)) {
    subscription.dispose()
  }
}

describe('activate', () => {
  beforeEach(() => {
    resetVscode()
    window.showInformationMessage.mockReset()
    window.showWarningMessage.mockReset()
  })

  afterEach(disposeSubscriptions)

  it('should do nothing on deactivate before it was activated', async () => {
    await expect(deactivate()).resolves.toBeUndefined()
  })

  it('should register every contributed command', () => {
    activateIn(vscode.ExtensionMode.Production)

    for (const { command } of manifest.contributes.commands) {
      expect(() => vscode.commands.registerCommand(command, vi.fn())).toThrow(
        `command '${command}' already exists`,
      )
    }
  })

  it('should allow writes on a connection, once confirmed', async () => {
    const globalState = new FakeMemento()
    await globalState.update('sqldoro.connections', { version: 1, connections: [SAVED_CONNECTION] })
    activateIn(vscode.ExtensionMode.Production, globalState)
    window.showWarningMessage.mockResolvedValue('Allow Writes')

    await vscode.commands.executeCommand(CommandId.AllowWrites, 'shop')

    expect(globalState.get('sqldoro.connections')).toMatchObject({
      connections: [{ id: 'shop', isReadOnly: false }],
    })
  })

  it('should show the Connections view and log to its own output channel', () => {
    activateIn(vscode.ExtensionMode.Production)

    expect(treeViews.map((view) => view.viewId)).toStrictEqual([
      ViewId.Connections,
      ViewId.History,
      ViewId.SavedQueries,
    ])
    expect(outputChannels.map((channel) => channel.name)).toStrictEqual(['sqldoro'])
  })

  it('should greet without a suffix in an installed build', async () => {
    activateIn(vscode.ExtensionMode.Production)

    const greeting = await vscode.commands.executeCommand<string>(CommandId.Hello)

    expect(greeting).toBe('Hello from sqldoro!')
    expect(window.showInformationMessage).toHaveBeenCalledExactlyOnceWith('Hello from sqldoro!')
  })

  it.each([vscode.ExtensionMode.Development, vscode.ExtensionMode.Test])(
    'should flag a development build when the extension mode is %s',
    async (extensionMode) => {
      activateIn(extensionMode)

      await expect(vscode.commands.executeCommand<string>(CommandId.Hello)).resolves.toBe(
        'Hello from sqldoro (development)!',
      )
    },
  )

  it('should refresh the view when the saved connections change', async () => {
    const globalState = new FakeMemento()
    await globalState.update('sqldoro.connections', { version: 1, connections: [SAVED_CONNECTION] })
    activateIn(vscode.ExtensionMode.Production, globalState)
    const provider = treeViews[0]?.options.treeDataProvider as vscode.TreeDataProvider<unknown>
    const fired = vi.fn()
    provider.onDidChangeTreeData?.(fired)

    await vscode.commands.executeCommand(CommandId.DuplicateConnection, 'shop')

    expect(fired).toHaveBeenCalledWith(undefined)
  })

  it('should show the filter above the view', async () => {
    activateIn(vscode.ExtensionMode.Production)
    vi.mocked(window.showInputBox).mockResolvedValueOnce('orders')

    await vscode.commands.executeCommand(CommandId.Filter)

    expect(treeViews[0]?.message).toBe('Tables and views matching "orders"')
  })

  it('should warn about saved connections it cannot read and open the output on request', async () => {
    const globalState = new FakeMemento()
    await globalState.update('sqldoro.connections', { version: 1, connections: [{ id: 'broken' }] })
    window.showWarningMessage.mockResolvedValueOnce('Show Output')

    activateIn(vscode.ExtensionMode.Production, globalState)

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Some saved connections cannot be read: the sqldoro output says why.',
      'Show Output',
    )
    await vi.waitFor(() => {
      expect(outputChannels[0]?.show).toHaveBeenCalledOnce()
    })
  })

  it('should not open the output when the warning is dismissed', async () => {
    const globalState = new FakeMemento()
    await globalState.update('sqldoro.connections', { version: 2, connections: [] })
    window.showWarningMessage.mockResolvedValueOnce(undefined)

    activateIn(vscode.ExtensionMode.Production, globalState)
    await Promise.resolve()

    expect(outputChannels[0]?.show).not.toHaveBeenCalled()
  })

  it('should stop answering its commands once disposed', async () => {
    activateIn(vscode.ExtensionMode.Production)

    disposeSubscriptions()

    await expect(vscode.commands.executeCommand(CommandId.Hello)).rejects.toThrow(CommandId.Hello)
  })

  it('should test the connection of a form through the session opener of the extension', async () => {
    const globalState = new FakeMemento()
    await globalState.update('sqldoro.connections', { version: 1, connections: [SAVED_CONNECTION] })
    activateIn(vscode.ExtensionMode.Production, globalState)
    const { panel } = await openForm(
      vscode.commands.executeCommand(CommandId.EditConnection, 'shop'),
    )
    const ssl = { ...SAVED_CONNECTION.ssl, mode: 'require', caPath: '/missing/sqldoro-ca.pem' }

    await fromForm(panel, {
      type: 'test',
      draft: { connection: { ...SAVED_CONNECTION, ssl }, secretChanges: [] },
    })

    await vi.waitFor(() => {
      expect(sentToForm(panel, 'tested')).toHaveLength(1)
    })
    const [tested] = sentToForm(panel, 'tested')
    expect(tested).toMatchObject({ type: 'tested', isSuccess: false })
    expect(String(tested?.['message'])).toContain('sqldoro-ca.pem')
    disposeSubscriptions()
    expect(formPanels()).toStrictEqual([])
  })

  it('should close the open sessions on deactivate', async () => {
    activateIn(vscode.ExtensionMode.Production)

    await expect(deactivate()).resolves.toBeUndefined()
  })
})
