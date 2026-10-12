import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
  type CommandHarness,
  commandHarness,
  POSTGRES,
  saved,
} from '../../../test/support/commands.ts'
import {
  commands,
  contextKeys,
  type FakeFlaggedBox,
  inputBoxes,
  resetVscode,
} from '../../../test/vscode.ts'
import { type ConnectionConfig, newConnection } from '../../core/connection/connection.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { CommandId, ContextKey } from '../command-id.ts'

const SHOP: ConnectionConfig = {
  ...newConnection('shop', POSTGRES),
  name: 'Shop',
  user: 'app',
  database: 'shop',
}
const CATALOG = {
  listSchemas: async () => Promise.resolve([{ name: 'sales' }]),
  listTables: async () => Promise.resolve([{ name: 'orders' }, { name: 'lines' }]),
  listViews: async () => Promise.resolve([{ name: 'order_totals', isMaterialized: false }]),
}

let harness: CommandHarness

async function connected(session: Partial<EngineSession> = CATALOG): Promise<void> {
  harness = commandHarness({ session })
  await saved(harness, SHOP)
  await vscode.commands.executeCommand(CommandId.Connect, 'shop')
}

// Find Table in Explorer, and the box it shows.
function finding(): { readonly found: Thenable<unknown>; readonly sut: FakeFlaggedBox } {
  const found = vscode.commands.executeCommand(CommandId.FindTable)
  const sut = inputBoxes.at(-1)
  if (sut === undefined) {
    throw new Error('no input box')
  }
  return { found, sut }
}

async function loaded(sut: FakeFlaggedBox): Promise<void> {
  await vi.waitFor(() => {
    expect(sut.busy).toBe(false)
  })
}

beforeEach(() => {
  resetVscode()
})

afterEach(() => {
  harness.dispose()
})

describe('Find Table in Explorer', () => {
  it('should filter the explorer on every keystroke and say how many tables match', async () => {
    await connected()
    const { found, sut } = finding()

    sut.type('l')
    sut.type('li')
    await loaded(sut)

    expect(harness.context.explorer.find).toBe('li')
    expect(sut).toMatchObject({
      title: 'Find Table in Explorer',
      placeholder: 'Part of the name of a table or view',
      ignoreFocusOut: true,
      isShown: true,
      prompt: '1 table or view matches · Enter opens the best match · Escape restores the tree',
    })
    sut.escape()
    await found
  })

  it('should load the tables as soon as it opens, and say so while they load', async () => {
    const { promise, resolve } = Promise.withResolvers<{ name: string }[]>()
    const listTables = vi.fn(async () => promise)
    await connected({ ...CATALOG, listTables })
    const { found, sut } = finding()

    await vi.waitFor(() => {
      expect(listTables).toHaveBeenCalledOnce()
    })
    sut.type('ord')

    expect(sut.busy).toBe(true)
    expect(sut.prompt).toBe('Loading tables…')
    resolve([{ name: 'orders' }])
    await loaded(sut)
    expect(sut.prompt).toBe(
      '2 tables and views match · Enter opens the best match · Escape restores the tree',
    )
    sut.escape()
    await found
  })

  it('should open the rows of the best match on Enter and keep the explorer filtered', async () => {
    const openTableData = vi.fn()
    commands.registerCommand(CommandId.OpenTableData, openTableData)
    await connected()
    const { found, sut } = finding()
    sut.type('lines')
    await loaded(sut)

    sut.accept()
    await found

    expect(openTableData).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: 'table',
        connectionId: 'shop',
        place: { database: 'shop', schema: 'sales', name: 'lines' },
      }),
    )
    expect(harness.context.explorer.find).toBe('lines')
    expect(harness.viewMessages.at(-1)).toBe('Tables and views matching "lines"')
    expect(contextKeys.get(ContextKey.IsFiltered)).toBe(true)
    expect(sut.isDisposed).toBe(true)
  })

  it('should open nothing on Enter when nothing matches', async () => {
    const openTableData = vi.fn()
    commands.registerCommand(CommandId.OpenTableData, openTableData)
    await connected()
    const { found, sut } = finding()

    sut.accept()
    await found

    expect(openTableData).not.toHaveBeenCalled()
    expect(harness.viewMessages.at(-1)).toBe('')
    expect(contextKeys.get(ContextKey.IsFiltered)).toBe(false)
  })

  it('should start from the text it kept, and give the tree back on Escape', async () => {
    await connected()
    harness.context.explorer.setFind('ord')
    const { found, sut } = finding()
    expect(sut.value).toBe('ord')

    sut.type('line')
    sut.escape()
    await found

    expect(harness.context.explorer.find).toBe('')
    expect(harness.viewMessages.at(-1)).toBe('')
    expect(contextKeys.get(ContextKey.IsFiltered)).toBe(false)
  })

  it('should show the same box when asked again while it is open', async () => {
    await connected()
    const first = finding()
    first.sut.type('ord')

    const second = vscode.commands.executeCommand(CommandId.FindTable)
    expect(harness.context.explorer.find).toBe('ord')
    first.sut.escape()
    await Promise.all([first.found, second])
    expect(inputBoxes).toHaveLength(1)

    const next = finding()
    next.sut.escape()
    await next.found

    expect(next.sut).not.toBe(first.sut)
  })

  it('should empty the box when the filter is cleared elsewhere', async () => {
    await connected()
    const { found, sut } = finding()
    sut.type('ord')

    await vscode.commands.executeCommand(CommandId.ClearFilter)

    expect(sut.value).toBe('')
    expect(sut.isShown).toBe(true)
    sut.escape()
    await found
  })

  it('should say that it finds the tables of connected connections only', async () => {
    harness = commandHarness({ session: CATALOG })
    await saved(harness, SHOP)
    const { found, sut } = finding()

    sut.type('ord')

    expect(sut.prompt).toBe('Connect to a connection to find its tables.')
    sut.escape()
    await found
  })
})
