import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { editableResult } from '../../../test/support/edits.ts'
import {
  LINES_REFERENCE,
  type NavigationHarness,
  navigationHarness,
  NOTE_COLUMN,
  postedOf,
} from '../../../test/support/navigation.ts'
import { tabOf } from '../../../test/support/tables.ts'
import { documents, resetVscode, webviewPanels, window } from '../../../test/vscode.ts'
import { tableUri } from '../tables/table-uri.ts'

// sales.lines.note_text points at the note of an order: row 0 of the orders has none.
const NOTE_REFERENCE = {
  name: 'lines_note',
  schema: 'sales',
  table: 'lines',
  columns: ['note_text'],
  referencedColumns: ['note'],
}

let nav: NavigationHarness

beforeEach(() => {
  resetVscode()
  webviewPanels.length = 0
  window.showInformationMessage.mockReset()
  window.showWarningMessage.mockReset()
})

afterEach(() => {
  nav.harness.dispose()
})

describe('navigating, at the edges', () => {
  it('should do nothing from a cell that is no link, or a reference the rows do not have', async () => {
    nav = await navigationHarness()
    const before = nav.sent().length

    nav.send({ type: 'navigate', row: 1, column: 0, isInPlace: false })
    nav.send({ type: 'openReference', row: 1, reference: 7, isInPlace: false })
    nav.send({ type: 'navigate', row: 9, column: NOTE_COLUMN, isInPlace: false })
    await Promise.resolve()

    expect(nav.sent()).toHaveLength(before)
    expect(webviewPanels).toHaveLength(1)
  })

  it('should say that a row without the referenced values is referenced by no row', async () => {
    nav = await navigationHarness({ references: [NOTE_REFERENCE, LINES_REFERENCE] })

    nav.send({ type: 'openReference', row: 0, reference: 0, isInPlace: false })

    await vi.waitFor(() => {
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'This row holds no value for the columns the references point at.',
      )
    })
  })

  it('should count only the references whose values the row holds', async () => {
    nav = await navigationHarness({ references: [NOTE_REFERENCE, LINES_REFERENCE] })

    nav.send({ type: 'countReferences', row: 0 })

    await vi.waitFor(() => {
      expect(postedOf(nav.orders.panel, 'referenceCounts').at(-1)).toMatchObject({
        counts: [null, '3'],
      })
    })
    expect(nav.sent().filter(({ sql }) => sql.includes('COUNT(*)'))).toHaveLength(1)
  })

  it('should open the rows a link of an editor result points at in a panel of their own', async () => {
    nav = await navigationHarness()
    const { panel, tab } = await editableResult(nav.harness)
    await vi.waitFor(() => {
      expect(tab.meta.links).toHaveLength(1)
    })

    panel.webview.send({
      type: 'navigate',
      tabId: tab.id,
      viewVersion: tab.viewVersion,
      row: 1,
      column: NOTE_COLUMN,
      isInPlace: true,
    })

    await vi.waitFor(() => {
      expect(webviewPanels.at(-1)?.title).toBe('Shop/shop/sales.notes')
    })
    // The panel was named first, then its tab.
    const uri = tableUri({
      connectionId: 'shop',
      table: { database: 'shop', schema: 'sales', name: 'notes' },
      instance: nav.harness.tabIds.at(-2) ?? '',
    })
    expect(nav.harness.tables.navigations.get(uri)?.steps).toHaveLength(1)
  })

  it('should not navigate from an editor that lost its connection', async () => {
    nav = await navigationHarness()
    const { editor, panel, tab } = await editableResult(nav.harness)
    await vi.waitFor(() => {
      expect(tab.meta.links).toHaveLength(1)
    })
    await nav.harness.bindings.forgetUntitled(editor.document.uri)
    const before = nav.sent().length

    panel.webview.send({
      type: 'navigate',
      tabId: tab.id,
      viewVersion: tab.viewVersion,
      row: 1,
      column: NOTE_COLUMN,
      isInPlace: false,
    })
    await Promise.resolve()

    expect(nav.sent()).toHaveLength(before)
  })

  it('should not go to a step the trail does not have, nor from an editor', async () => {
    nav = await navigationHarness()
    const { panel } = await editableResult(nav.harness)
    const before = nav.sent().length

    nav.orders.panel.webview.send({ type: 'goToStep', step: 9 })
    panel.webview.send({ type: 'goToStep', step: 0 })
    await Promise.resolve()

    expect(nav.sent()).toHaveLength(before)
  })

  it('should keep the rows and their changes when the user does not drop them', async () => {
    nav = await navigationHarness()
    const before = nav.sent().length
    nav.send({ type: 'navigate', row: 1, column: NOTE_COLUMN, isInPlace: true })
    await nav.settled(before + 1)
    nav.orders.panel.webview.send({ type: 'goToStep', step: 0 })
    await nav.settled(before + 2)
    const tab = tabOf(nav.harness, nav.orders.uri)
    await vi.waitFor(() => {
      expect(tab.toTab().editing.state).toBe('editable')
    })
    nav.orders.panel.webview.send({
      type: 'edit',
      tabId: tab.id,
      viewVersion: tab.viewVersion,
      edit: { kind: 'set', block: { firstRow: 1, lastRow: 1, columns: [1] }, input: 'B-2' },
    })
    await vi.waitFor(() => {
      expect(tab.toTab().editing.rows).toHaveLength(1)
    })

    nav.orders.panel.webview.send({
      type: 'navigate',
      tabId: tab.id,
      viewVersion: tab.viewVersion,
      row: 1,
      column: NOTE_COLUMN,
      isInPlace: true,
    })
    nav.orders.panel.webview.send({ type: 'goToStep', step: 1 })
    await vi.waitFor(() => {
      expect(window.showWarningMessage).toHaveBeenCalledTimes(2)
    })

    expect(nav.sent()).toHaveLength(before + 2)
    expect(nav.harness.tables.navigations.current(nav.orders.uri)?.id).toBe(0)
  })

  it('should ignore what names a tab that is gone, a view that changed or a tab of a query', async () => {
    nav = await navigationHarness()
    const { panel, tab } = await editableResult(nav.harness)
    const before = nav.orders.panel.webview.posted.length
    const gone = { tabId: 'gone', viewVersion: 0, row: 0, column: NOTE_COLUMN, isInPlace: false }
    const stale = { ...gone, tabId: nav.orders.tab.id, viewVersion: 99 }

    for (const type of ['setLayout', 'countReferences', 'peek', 'fetchDistinct', 'openInEditor']) {
      nav.orders.panel.webview.send({ type, ...gone, layout: { order: [], hidden: [] } })
    }
    for (const type of ['countReferences', 'peek']) {
      nav.orders.panel.webview.send({ type, ...stale })
    }
    nav.orders.panel.webview.send({ type: 'openReference', ...stale, reference: 0 })
    panel.webview.send({ type: 'openInEditor', tabId: tab.id })
    await Promise.resolve()

    expect(nav.orders.panel.webview.posted).toHaveLength(before)
    expect(documents).toHaveLength(1)
  })
})
