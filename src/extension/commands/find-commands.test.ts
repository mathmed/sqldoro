import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
  type CommandHarness,
  commandHarness,
  POSTGRES,
  saved,
} from '../../../test/support/commands.ts'
import { commands, contextKeys, inputBoxes, quickPicks, resetVscode } from '../../../test/vscode.ts'
import { type ConnectionConfig, newConnection } from '../../core/connection/connection.ts'
import { CommandId, ContextKey } from '../command-id.ts'

const SHOP: ConnectionConfig = {
  ...newConnection('shop', POSTGRES),
  name: 'Shop',
  user: 'app',
  database: 'shop',
}
const CATALOG = {
  // A namespace named as its database (MySQL) reads once.
  listSchemas: async () => Promise.resolve([{ name: 'sales' }, { name: 'shop' }]),
  listTables: async () => Promise.resolve([{ name: 'orders' }, { name: 'lines' }]),
  listViews: async () => Promise.resolve([{ name: 'order_totals', isMaterialized: false }]),
}

let harness: CommandHarness

async function settle(): Promise<void> {
  await vi.waitFor(() => {
    expect(quickPicks.at(-1)?.items.length ?? 0).toBeGreaterThan(0)
  })
}

beforeEach(async () => {
  resetVscode()
  harness = commandHarness({ session: CATALOG })
  await saved(harness, SHOP)
})

afterEach(() => {
  harness.dispose()
})

describe('Find Table in Explorer', () => {
  it('should filter the explorer as the name is typed, and keep it on Enter', async () => {
    const finding = vscode.commands.executeCommand(CommandId.FindTable)
    const box = inputBoxes.at(-1)

    box?.type('ord')
    expect(harness.context.explorer.find).toBe('ord')
    box?.accept()
    await finding

    expect(harness.context.explorer.find).toBe('ord')
    expect(harness.viewMessages.at(-1)).toBe('Tables and views matching "ord"')
    expect(contextKeys.get(ContextKey.IsFiltered)).toBe(true)
    expect(box?.isDisposed).toBe(true)
  })

  it('should start from the text it kept, and give the tree back on Escape', async () => {
    harness.context.explorer.setFind('ord')
    const finding = vscode.commands.executeCommand(CommandId.FindTable)
    const box = inputBoxes.at(-1)
    expect(box?.value).toBe('ord')

    box?.type('line')
    box?.escape()
    await finding

    expect(harness.context.explorer.find).toBe('')
    expect(harness.viewMessages.at(-1)).toBe('')
    expect(contextKeys.get(ContextKey.IsFiltered)).toBe(false)
  })
})

describe('Go to Table', () => {
  it('should list the tables and views of the connected connections and open the one picked', async () => {
    const openTableData = vi.fn()
    commands.registerCommand(CommandId.OpenTableData, openTableData)
    await vscode.commands.executeCommand(CommandId.Connect, 'shop')

    const going = vscode.commands.executeCommand(CommandId.GoToTable)
    await settle()
    const pick = quickPicks.at(-1)
    expect(pick?.items).toMatchObject([
      { label: '$(table) orders', description: 'Shop · shop.sales' },
      { label: '$(table) lines', description: 'Shop · shop.sales' },
      { label: '$(eye) order_totals', description: 'Shop · shop.sales' },
      { label: '$(table) orders', description: 'Shop · shop' },
      { label: '$(table) lines', description: 'Shop · shop' },
      { label: '$(eye) order_totals', description: 'Shop · shop' },
    ])
    pick?.pick(pick.items[0])
    await going

    expect(openTableData).toHaveBeenCalledExactlyOnceWith({
      kind: 'table',
      connectionId: 'shop',
      place: { database: 'shop', schema: 'sales', name: 'orders' },
    })
  })

  it('should say that it lists the tables of connected connections only', async () => {
    const going = vscode.commands.executeCommand(CommandId.GoToTable)
    await vi.waitFor(() => {
      expect(quickPicks.at(-1)?.placeholder).toBe(
        'Connect to a connection first: Go to Table lists the tables of the connected ones.',
      )
    })
    quickPicks.at(-1)?.accept()
    await going

    expect(quickPicks.at(-1)?.isDisposed).toBe(true)
  })
})
