import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  lastPanel,
  type NavigationHarness,
  navigationHarness,
  NOTE_COLUMN,
  postedOf,
} from '../../../test/support/navigation.ts'
import { ORDERS_REF } from '../../../test/support/tables.ts'
import { resetVscode, webviewPanels, window } from '../../../test/vscode.ts'

let nav: NavigationHarness

beforeEach(async () => {
  resetVscode()
  webviewPanels.length = 0
  window.showInformationMessage.mockReset()
  window.showWarningMessage.mockReset()
  nav = await navigationHarness()
})

afterEach(() => {
  nav.harness.dispose()
})

describe('a link of a table panel', () => {
  it('should tell the view which columns are links and which tables reference the rows', () => {
    expect(nav.orders.tab.toTab().meta.at(NOTE_COLUMN)).toStrictEqual({
      choices: [],
      reference: 'notes (text)',
    })
    expect(nav.orders.tab.toTab().references).toStrictEqual([{ label: 'lines (order_id)' }])
  })

  it('should open the row it points at in a panel of its own, through the guards', async () => {
    const before = nav.sent().length
    nav.send({ type: 'navigate', row: 1, column: NOTE_COLUMN, isInPlace: false })

    await vi.waitFor(() => {
      expect(webviewPanels).toHaveLength(2)
    })
    await nav.settled(before + 1)
    expect(lastPanel().title).toBe('Shop/shop/sales.notes')
    expect(nav.sent().at(-1)).toMatchObject({
      sql: 'SELECT * FROM "sales"."notes" WHERE "text" = $1',
      values: ['gift'],
    })
  })

  it('should show the panel that shows the row already instead of opening another', async () => {
    nav.send({ type: 'navigate', row: 1, column: NOTE_COLUMN, isInPlace: false })
    await vi.waitFor(() => {
      expect(webviewPanels).toHaveLength(2)
    })

    nav.send({ type: 'navigate', row: 1, column: NOTE_COLUMN, isInPlace: false })

    await vi.waitFor(() => {
      expect(lastPanel().reveal).toHaveBeenCalled()
    })
    expect(webviewPanels).toHaveLength(2)
  })

  it('should open the row in place, keep the trail and go back along it', async () => {
    const before = nav.sent().length
    nav.send({ type: 'navigate', row: 1, column: NOTE_COLUMN, isInPlace: true })
    await nav.settled(before + 1)

    expect(webviewPanels).toHaveLength(1)
    expect(postedOf(nav.orders.panel, 'trail').at(-1)).toStrictEqual({
      type: 'trail',
      crumbs: [
        { id: 0, label: 'orders #2', isCurrent: false, isQuery: false },
        { id: 1, label: 'notes #gift', isCurrent: true, isQuery: false },
      ],
    })
    nav.orders.panel.webview.send({ type: 'goToStep', step: 0 })
    await nav.settled(before + 2)
    expect(nav.sent().at(-1)?.sql).toBe('SELECT * FROM "sales"."orders"')
  })

  it('should say that a NULL points at no row', async () => {
    nav.send({ type: 'navigate', row: 0, column: NOTE_COLUMN, isInPlace: false })

    await vi.waitFor(() => {
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'This cell points at no row: it is NULL.',
      )
    })
    expect(webviewPanels).toHaveLength(1)
  })

  it('should leave a navigation made on another view of the rows alone', async () => {
    const before = nav.sent().length
    nav.orders.panel.webview.send({
      type: 'navigate',
      tabId: nav.orders.tab.id,
      viewVersion: nav.orders.tab.viewVersion + 1,
      row: 1,
      column: NOTE_COLUMN,
      isInPlace: false,
    })
    await Promise.resolve()

    expect(nav.sent()).toHaveLength(before)
    expect(webviewPanels).toHaveLength(1)
  })
})

describe('the rows that reference a row', () => {
  it('should open the rows of a referencing table', async () => {
    const before = nav.sent().length
    nav.send({ type: 'openReference', row: 0, reference: 0, isInPlace: false })

    await nav.settled(before + 1)
    expect(lastPanel().title).toBe('Shop/shop/sales.lines')
    expect(nav.sent().at(-1)).toMatchObject({
      sql: 'SELECT * FROM "sales"."lines" WHERE "order_id" = $1',
      values: [1],
    })
  })

  it('should count them on the server when asked', async () => {
    nav.send({ type: 'countReferences', row: 0 })

    await vi.waitFor(() => {
      expect(postedOf(nav.orders.panel, 'referenceCounts')).toStrictEqual([
        {
          type: 'referenceCounts',
          tabId: nav.orders.tab.id,
          viewVersion: nav.orders.tab.viewVersion,
          row: 0,
          counts: ['3'],
        },
      ])
    })
    expect(nav.sent().at(-1)).toMatchObject({
      sql: 'SELECT COUNT(*) AS "count" FROM "sales"."lines" WHERE "order_id" = $1',
      values: [1],
    })
  })
})

describe('peeking at the row a link points at', () => {
  it('should read it once per panel and show a few of its columns', async () => {
    nav.send({ type: 'peek', row: 1, column: NOTE_COLUMN })
    await vi.waitFor(() => {
      expect(postedOf(nav.orders.panel, 'peek')).toHaveLength(1)
    })
    const before = nav.sent().length
    nav.send({ type: 'peek', row: 1, column: NOTE_COLUMN })
    await vi.waitFor(() => {
      expect(postedOf(nav.orders.panel, 'peek')).toHaveLength(2)
    })

    expect(postedOf(nav.orders.panel, 'peek').at(-1)).toStrictEqual({
      type: 'peek',
      tabId: nav.orders.tab.id,
      viewVersion: nav.orders.tab.viewVersion,
      row: 1,
      column: NOTE_COLUMN,
      peek: {
        title: 'notes #gift',
        columns: ['text', 'description'],
        values: ['gift', 'A present'],
        problem: '',
      },
    })
    expect(nav.sent()).toHaveLength(before)
  })

  it('should say why a NULL shows nothing', async () => {
    nav.send({ type: 'peek', row: 0, column: NOTE_COLUMN })

    await vi.waitFor(() => {
      expect(postedOf(nav.orders.panel, 'peek').at(-1)).toMatchObject({
        peek: { problem: 'This cell points at no row: it is NULL.' },
      })
    })
  })
})

describe('what a table panel asks of the extension', () => {
  it('should list the values a column holds in the rows fetched', async () => {
    nav.send({ type: 'fetchDistinct', column: 1 })

    await vi.waitFor(() => {
      expect(postedOf(nav.orders.panel, 'distinct')).toStrictEqual([
        {
          type: 'distinct',
          tabId: nav.orders.tab.id,
          column: 1,
          values: ['A-1', 'A-2'],
          isComplete: true,
        },
      ])
    })
  })

  it('should keep the columns it shows for its table', async () => {
    const layout = { order: ['code', 'id'], hidden: ['note'] }
    nav.send({ type: 'setLayout', layout })

    await vi.waitFor(() => {
      expect(nav.harness.tables.layouts.get('shop', ORDERS_REF)).toStrictEqual(layout)
    })
    expect(nav.orders.tab.layout).toStrictEqual(layout)
  })
})
