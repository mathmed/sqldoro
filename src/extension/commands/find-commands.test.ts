import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
  type CommandHarness,
  commandHarness,
  POSTGRES,
  saved,
} from '../../../test/support/commands.ts'
import { commands, quickPicks, resetVscode } from '../../../test/vscode.ts'
import { type ConnectionConfig, newConnection } from '../../core/connection/connection.ts'
import { CommandId } from '../command-id.ts'

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

  it('should filter as Find Table in Explorer does: the characters in order, the best first', async () => {
    await vscode.commands.executeCommand(CommandId.Connect, 'shop')
    const going = vscode.commands.executeCommand(CommandId.GoToTable)
    await settle()
    const pick = quickPicks.at(-1)
    if (pick === undefined) {
      throw new Error('no quick pick')
    }
    const labels = (text: string): unknown[] => {
      pick.type(text)
      return pick.items.map((item) => (item as { label: string }).label)
    }

    expect(labels('ln')).toStrictEqual(['$(table) lines', '$(table) lines'])
    expect(labels('ordtl')).toStrictEqual(['$(eye) order_totals', '$(eye) order_totals'])
    expect(labels('sales')).toStrictEqual([
      '$(table) orders',
      '$(table) lines',
      '$(eye) order_totals',
    ])
    expect(labels(' ')).toHaveLength(6)
    expect(pick.items).toMatchObject(Array.from({ length: 6 }, () => ({ alwaysShow: true })))
    pick.accept()
    await going
  })

  it('should list what it can, and say in the log why the rest could not be listed', async () => {
    harness.dispose()
    resetVscode()
    harness = commandHarness({
      session: { listSchemas: async () => Promise.reject(new Error('permission denied')) },
    })
    await saved(harness, SHOP)
    await vscode.commands.executeCommand(CommandId.Connect, 'shop')

    const going = vscode.commands.executeCommand(CommandId.GoToTable)
    await vi.waitFor(() => {
      expect(harness.log.warn).toHaveBeenCalled()
    })
    quickPicks.at(-1)?.accept()
    await going

    expect(quickPicks.at(-1)?.items).toStrictEqual([])
    expect(harness.log.warn).toHaveBeenCalledWith(
      'Could not list the tables of "Shop": permission denied',
    )
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
