import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type NavigationHarness, navigationHarness } from '../../../test/support/navigation.ts'
import { ORDERS_REF } from '../../../test/support/tables.ts'
import { commands, documents, resetVscode, webviewPanels, window } from '../../../test/vscode.ts'
import { withCurrent } from '../../core/navigation/history.ts'
import { CommandId } from '../command-id.ts'

let nav: NavigationHarness

beforeEach(async () => {
  resetVscode()
  webviewPanels.length = 0
  documents.length = 0
  window.showWarningMessage.mockReset()
  nav = await navigationHarness()
})

afterEach(() => {
  nav.harness.dispose()
})

function lastDocument(): string | undefined {
  return documents.at(-1)?.getText()
}

describe('the query of a table panel in an SQL editor', () => {
  it('should open what the panel runs, its condition, sort and filters written in', async () => {
    nav.send({ type: 'filterTable', condition: "code <> 'A-9'" })
    await nav.settled(2)
    nav.send({
      type: 'setView',
      view: {
        sort: [{ column: 0, isDescending: true }],
        filters: [{ column: 1, operator: 'startsWith', values: ['A'] }],
      },
      isServerSide: true,
    })
    await nav.settled(3)

    nav.send({ type: 'openInEditor' })

    await vi.waitFor(() => {
      expect(lastDocument()).toBe(
        [
          'SELECT * FROM "sales"."orders" WHERE (code <> \'A-9\'',
          ') AND LOWER(CAST("code" AS TEXT)) LIKE \'a%\'',
          'ORDER BY "id" DESC',
        ].join('\n'),
      )
    })
    expect(nav.harness.bindings.get(documents.at(-1)?.uri as never)).toStrictEqual({
      connectionId: 'shop',
      database: 'shop',
      schema: 'sales',
    })
  })

  it('should select the columns the grid shows, in its order, when it hides some', async () => {
    nav.send({ type: 'setLayout', layout: { order: ['code', 'id'], hidden: ['note', 'total'] } })
    await vi.waitFor(() => {
      expect(nav.orders.tab.layout.hidden).toHaveLength(2)
    })

    nav.send({ type: 'openInEditor' })

    await vi.waitFor(() => {
      expect(lastDocument()).toBe(
        'SELECT "code", "id", "payload", "placed_at", "total_cents" FROM "sales"."orders"',
      )
    })
  })

  it('should say why it cannot write a condition it cannot run', async () => {
    nav.harness.tables.navigations.update(nav.orders.uri, (navigation) =>
      withCurrent(navigation, { condition: 'id = $1' }),
    )

    nav.send({ type: 'openInEditor' })

    await vi.waitFor(() => {
      expect(window.showWarningMessage).toHaveBeenCalledOnce()
    })
    expect(documents).toStrictEqual([])
  })

  it('should do nothing for a panel whose connection is gone', async () => {
    nav.harness.connections.delete('shop')

    nav.send({ type: 'openInEditor' })
    nav.send({ type: 'setLayout', layout: { order: [], hidden: ['note'] } })
    await vi.waitFor(() => {
      expect(nav.orders.tab.layout.hidden).toStrictEqual(['note'])
    })

    expect(documents).toStrictEqual([])
    expect(nav.harness.tables.layouts.get('shop', ORDERS_REF).hidden).toStrictEqual([])
  })
})

describe('the WHERE of a table panel', () => {
  it('should refuse a condition that is not one condition of its own', async () => {
    const before = nav.sent().length

    nav.send({ type: 'filterTable', condition: 'id = $1' })

    await vi.waitFor(() => {
      expect(window.showWarningMessage).toHaveBeenCalledOnce()
    })
    expect(nav.sent()).toHaveLength(before)
  })
})

describe('allowing writes from a table panel', () => {
  it('should ask to allow writes on the connection of the panel', async () => {
    const allowWrites = vi.fn()
    commands.registerCommand(CommandId.AllowWrites, allowWrites)

    nav.orders.panel.webview.send({ type: 'allowWrites' })

    await vi.waitFor(() => {
      expect(allowWrites).toHaveBeenCalledExactlyOnceWith('shop')
    })
  })
})

describe('the step a table panel shows', () => {
  it('should read the rows without a view that names columns the table no longer has', async () => {
    nav.harness.tables.navigations.update(nav.orders.uri, (navigation) =>
      withCurrent(navigation, {
        view: { sort: [{ column: 9, isDescending: false }], filters: [] },
        columns: ['id'],
      }),
    )

    nav.send({ type: 'refresh' })
    await nav.settled(2)
    nav.send({ type: 'openInEditor' })

    expect(nav.sent().at(-1)?.sql).toBe('SELECT * FROM "sales"."orders"')
    expect(nav.orders.tab.view).toStrictEqual({ sort: [], filters: [] })
    await vi.waitFor(() => {
      expect(lastDocument()).toBe('SELECT * FROM "sales"."orders"')
    })
  })

  it('should read nothing for a panel that lost its trail', async () => {
    const before = nav.sent().length
    nav.harness.tables.navigations.forget(nav.orders.uri)

    nav.send({ type: 'refresh' })
    nav.send({ type: 'openInEditor' })
    await Promise.resolve()

    expect(nav.sent()).toHaveLength(before)
    expect(documents).toStrictEqual([])
  })
})
