import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
  type CommandHarness,
  commandHarness,
  POSTGRES,
  saved,
} from '../../../test/support/commands.ts'
import { answerInputs, answerQuickPicks } from '../../../test/support/prompts.ts'
import { contextKeys, resetVscode, window } from '../../../test/vscode.ts'
import { type ConnectionConfig, newConnection } from '../../core/connection/connection.ts'
import { CommandId, ContextKey } from '../command-id.ts'
import { ConnectionStatus } from '../sessions/session-manager.ts'

const SHOP: ConnectionConfig = { ...newConnection('shop', POSTGRES), name: 'Shop', user: 'app' }

let harness: CommandHarness

beforeEach(() => {
  resetVscode()
  for (const prompt of [window.showQuickPick, window.showInputBox, window.showErrorMessage]) {
    prompt.mockReset()
  }
  harness = commandHarness()
})

afterEach(() => {
  harness.dispose()
})

describe('Connect and Disconnect', () => {
  it('should connect the connection of a node and disconnect it', async () => {
    await saved(harness, SHOP)

    await vscode.commands.executeCommand(CommandId.Connect, { connectionId: 'shop' })
    expect(harness.context.sessions.state('shop').status).toBe(ConnectionStatus.Connected)

    await vscode.commands.executeCommand(CommandId.Disconnect, { connectionId: 'shop' })
    expect(harness.context.sessions.state('shop').status).toBe(ConnectionStatus.Disconnected)
    expect(harness.close).toHaveBeenCalledOnce()
  })

  it('should show why the connection failed', async () => {
    harness.dispose()
    harness = commandHarness({ openError: new Error('getaddrinfo ENOTFOUND db') })
    await saved(harness, SHOP)

    await vscode.commands.executeCommand(CommandId.Connect, 'shop')

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Could not connect to "Shop": getaddrinfo ENOTFOUND db',
    )
  })

  it('should do nothing when the connection pick is dismissed', async () => {
    await saved(harness, SHOP)
    answerQuickPicks(undefined, undefined)

    await vscode.commands.executeCommand(CommandId.Connect)
    await vscode.commands.executeCommand(CommandId.Disconnect)

    expect(harness.requests).toStrictEqual([])
  })
})

describe('Refresh', () => {
  it('should refresh the node it is called on, or everything', async () => {
    const fired = vi.fn()
    harness.context.explorer.onDidChangeTreeData(fired)
    const node = {
      id: 'node',
      connectionId: 'shop',
      kind: 'database',
      treeItem: vi.fn(),
      children: vi.fn(),
    }

    await vscode.commands.executeCommand(CommandId.Refresh, node)
    await vscode.commands.executeCommand(CommandId.Refresh)
    await vscode.commands.executeCommand(CommandId.Refresh, 'not a node')

    expect(fired.mock.calls).toStrictEqual([[node], [undefined], [undefined]])
  })
})

describe('Filter', () => {
  it('should filter the tables and views by name and say so above the view', async () => {
    answerInputs(' orders ')

    await vscode.commands.executeCommand(CommandId.Filter)

    expect(harness.context.explorer.filter).toBe('orders')
    expect(harness.viewMessages).toStrictEqual(['Tables and views matching "orders"'])
    expect(contextKeys.get(ContextKey.IsFiltered)).toBe(true)
    expect(window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Filter Tables and Views', value: '' }),
    )
  })

  it('should start from the current filter and keep it when the prompt is dismissed', async () => {
    answerInputs('orders', undefined)

    await vscode.commands.executeCommand(CommandId.Filter)
    await vscode.commands.executeCommand(CommandId.Filter)

    expect(window.showInputBox).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 'orders' }),
    )
    expect(harness.context.explorer.filter).toBe('orders')
  })

  it('should clear the filter', async () => {
    answerInputs('orders')
    await vscode.commands.executeCommand(CommandId.Filter)

    await vscode.commands.executeCommand(CommandId.ClearFilter)

    expect(harness.context.explorer.filter).toBe('')
    expect(harness.viewMessages.at(-1)).toBe('')
    expect(contextKeys.get(ContextKey.IsFiltered)).toBe(false)
  })
})
