import { afterEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { CommandId } from './command-id.ts'
import { activate } from './extension.ts'

const subscriptions: vscode.Disposable[] = []

function activateIn(extensionMode: vscode.ExtensionMode): void {
  activate({ extensionMode, subscriptions })
}

function disposeSubscriptions(): void {
  for (const subscription of subscriptions.splice(0)) {
    subscription.dispose()
  }
}

describe('activate', () => {
  afterEach(disposeSubscriptions)

  it('should hand the hello command to the extension subscriptions', () => {
    activateIn(vscode.ExtensionMode.Production)

    expect(subscriptions).toHaveLength(1)
  })

  it('should greet without a suffix in an installed build', async () => {
    const showMessage = vi.spyOn(vscode.window, 'showInformationMessage')
    activateIn(vscode.ExtensionMode.Production)

    const greeting = await vscode.commands.executeCommand<string>(CommandId.Hello)

    expect(greeting).toBe('Hello from sqldoro!')
    expect(showMessage).toHaveBeenCalledExactlyOnceWith('Hello from sqldoro!')
  })

  it.each([vscode.ExtensionMode.Development, vscode.ExtensionMode.Test])(
    'should flag a development build when the extension mode is %s',
    async (extensionMode) => {
      activateIn(extensionMode)

      const greeting = await vscode.commands.executeCommand<string>(CommandId.Hello)

      expect(greeting).toBe('Hello from sqldoro (development)!')
    },
  )

  it('should stop answering the hello command once disposed', async () => {
    activateIn(vscode.ExtensionMode.Production)

    disposeSubscriptions()

    await expect(vscode.commands.executeCommand(CommandId.Hello)).rejects.toThrow(CommandId.Hello)
  })
})
