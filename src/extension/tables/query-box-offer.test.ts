import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { answerOrders } from '../../../test/support/edits.ts'
import { postedOf } from '../../../test/support/navigation.ts'
import { openTable, type TableHarness, tableHarness, tabOf } from '../../../test/support/tables.ts'
import { resetVscode, webviewPanels } from '../../../test/vscode.ts'

let harness: TableHarness

beforeEach(async () => {
  resetVscode()
  webviewPanels.length = 0
  harness = await tableHarness({ autoLimit: 100 })
  answerOrders(harness)
})

afterEach(() => {
  harness.dispose()
})

describe('what the query box of a table panel works with', () => {
  it('should offer the tables and views of the schema of the table, read once', async () => {
    harness.engine.listTables.mockResolvedValue([{ name: 'orders' }, { name: 'lines' }])
    harness.engine.listViews.mockResolvedValue([{ name: 'totals', isMaterialized: false }])
    await harness.tables.queryHeight.set(150)

    const { panel, uri } = await openTable(harness)

    await vi.waitFor(() => {
      expect(postedOf(panel, 'queryBox')).toStrictEqual([
        { type: 'queryBox', tables: ['orders', 'lines', 'totals'], height: 150 },
      ])
    })
    panel.webview.send({ type: 'refresh', tabId: tabOf(harness, uri).id })
    await vi.waitFor(() => {
      expect(postedOf(panel, 'queryBox')).toHaveLength(2)
    })
    expect(harness.engine.listTables).toHaveBeenCalledExactlyOnceWith(
      { database: 'shop', schema: 'sales' },
      'names',
    )
  })

  it('should give it again to a view that loads again', async () => {
    const { panel } = await openTable(harness)
    await vi.waitFor(() => {
      expect(postedOf(panel, 'queryBox')).toHaveLength(1)
    })

    panel.webview.send({ type: 'ready' })

    expect(postedOf(panel, 'queryBox')).toHaveLength(2)
  })

  it('should leave the box without tables when the catalog cannot list them', async () => {
    harness.engine.listTables.mockRejectedValue(new Error('permission denied'))

    const { panel } = await openTable(harness)

    await vi.waitFor(() => {
      expect(postedOf(panel, 'queryBox')).toStrictEqual([
        { type: 'queryBox', tables: [], height: null },
      ])
    })
    expect(harness.log.warn).toHaveBeenCalledWith(
      'Could not read the tables of the schema for the query box: permission denied',
    )
  })

  it('should show the statement of the rows in the box, with the limit they were read with', async () => {
    const opened = await openTable(harness)

    await vi.waitFor(() => {
      expect(tabOf(harness, opened.uri).toTab().status).toBe('succeeded')
    })
    expect(tabOf(harness, opened.uri).toTab().queryBox).toStrictEqual({
      sql: 'SELECT * FROM "sales"."orders" LIMIT 100',
      isCustom: false,
    })
  })
})
