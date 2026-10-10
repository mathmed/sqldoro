import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import {
  type CommandHarness,
  commandHarness,
  POSTGRES,
  saved,
} from '../../../test/support/commands.ts'
import { commands, resetVscode, window } from '../../../test/vscode.ts'
import { EnvironmentTag, newConnection } from '../../core/connection/connection.ts'
import { CommandId } from '../command-id.ts'
import { registerWriteAccessCommands } from './write-access-commands.ts'

const SHOP = { ...newConnection('shop', POSTGRES), name: 'Shop', user: 'app' }

let harness: CommandHarness
let disposables: vscode.Disposable[]

beforeEach(() => {
  resetVscode()
  for (const prompt of [
    window.showInformationMessage,
    window.showWarningMessage,
    window.showInputBox,
    window.showQuickPick,
  ]) {
    prompt.mockReset()
  }
  harness = commandHarness()
  disposables = registerWriteAccessCommands({
    service: harness.context.service,
    policy: () => ({ productionEnvironments: new Set(['prod']) }),
    log: harness.log,
  })
})

afterEach(() => {
  harness.dispose()
  for (const disposable of disposables) {
    disposable.dispose()
  }
})

describe('Allow Writes', () => {
  it('should allow writes once confirmed, close the read-only sessions and log it', async () => {
    await saved(harness, SHOP)
    await harness.context.sessions.connect(SHOP)
    window.showWarningMessage.mockResolvedValue('Allow Writes')

    await commands.executeCommand(CommandId.AllowWrites, 'shop')

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Allow writes on "Shop"?',
      {
        modal: true,
        detail:
          'Statements that change data, the schema or the session will run on it. Make it read-only again at any time.',
      },
      'Allow Writes',
    )
    expect(harness.store.find('shop')?.isReadOnly).toBe(false)
    expect(harness.close).toHaveBeenCalledOnce()
    expect(harness.log.warn).toHaveBeenCalledWith('Writes allowed on "Shop"')
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Writes are allowed on "Shop": run the statement again. sqldoro still asks before an UPDATE or a DELETE that reaches every row.',
    )
  })

  it('should change nothing when the confirmation is dismissed', async () => {
    await saved(harness, SHOP)

    await commands.executeCommand(CommandId.AllowWrites, 'shop')

    expect(harness.store.find('shop')?.isReadOnly).toBe(true)
  })

  it('should ask for the name of a production connection', async () => {
    await saved(harness, { ...SHOP, environment: EnvironmentTag.Production })
    window.showInputBox.mockResolvedValueOnce('shop').mockResolvedValueOnce(' Shop ')

    await commands.executeCommand(CommandId.AllowWrites, 'shop')
    expect(harness.store.find('shop')?.isReadOnly).toBe(true)
    await commands.executeCommand(CommandId.AllowWrites, 'shop')

    const [options] = window.showInputBox.mock.calls[0] as [
      { title: string; prompt: string; validateInput: (value: string) => unknown },
    ]
    expect(options).toMatchObject({
      title: 'Allow Writes on PROD: Shop',
      prompt: '"Shop" is tagged PROD. Type Shop to allow writes on it.',
    })
    expect(options.validateInput('Sho')).toBe('Type Shop exactly to confirm')
    expect(harness.store.find('shop')?.isReadOnly).toBe(false)
    expect(window.showWarningMessage).not.toHaveBeenCalled()
  })

  it('should stop when the name is not typed', async () => {
    await saved(harness, { ...SHOP, environment: EnvironmentTag.Production })

    await commands.executeCommand(CommandId.AllowWrites, 'shop')

    expect(harness.store.find('shop')?.isReadOnly).toBe(true)
  })

  it('should say when writes are allowed already, and ask for the connection from the palette', async () => {
    await saved(harness, { ...SHOP, isReadOnly: false })
    window.showQuickPick.mockImplementation(async (items: unknown[]) => Promise.resolve(items[0]))

    await commands.executeCommand(CommandId.AllowWrites)
    await commands.executeCommand(CommandId.AllowWrites, 'gone')

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Writes are already allowed on "Shop".',
    )
  })
})

describe('Make Read-Only', () => {
  it('should make a writable connection read-only at once', async () => {
    await saved(harness, { ...SHOP, isReadOnly: false })

    await commands.executeCommand(CommandId.MakeReadOnly, 'shop')

    expect(harness.store.find('shop')?.isReadOnly).toBe(true)
    expect(harness.log.info).toHaveBeenCalledWith('"Shop" made read-only')
    expect(window.showInformationMessage).toHaveBeenCalledWith('"Shop" is read-only again.')
  })

  it('should say when it is read-only already, or gone', async () => {
    await saved(harness, SHOP)

    await commands.executeCommand(CommandId.MakeReadOnly, 'shop')
    await commands.executeCommand(CommandId.MakeReadOnly, 'gone')

    expect(window.showInformationMessage).toHaveBeenCalledWith('"Shop" is read-only already.')
  })
})
