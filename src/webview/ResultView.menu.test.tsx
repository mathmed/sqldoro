import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { cellAt, theGrid } from '../../test/webview/grid.ts'
import { shownView, type ShownView } from '../../test/webview/result-view.ts'
import type { ReferenceCountsMessage, ResultTab } from '../core/results/protocol.ts'

// A table panel: its tabs have a query box.
const TABLE_BOX = { sql: 'SELECT * FROM orders', isCustom: false }

const LINKED: Partial<ResultTab> = {
  meta: [
    { choices: [], reference: '' },
    { choices: [], reference: 'people (name)' },
  ],
  references: [{ label: 'orders (customer_id)' }, { label: 'notes (customer_id)' }],
}
const COUNTS: ReferenceCountsMessage = {
  type: 'referenceCounts',
  tabId: 'tab-1',
  viewVersion: 0,
  row: 0,
  counts: ['12345', null],
}

let view: ShownView

function linked(changes: Partial<ResultTab> = {}): void {
  view = shownView({ changes: { ...LINKED, ...changes } })
}

function menuItems(): (string | null)[] {
  return within(screen.getByRole('menu', { name: 'Cell actions' }))
    .getAllByRole('menuitem')
    .map((item) => item.textContent)
}

function pick(item: string): void {
  fireEvent.click(
    within(screen.getByRole('menu', { name: 'Cell actions' })).getByRole('menuitem', {
      name: item,
    }),
  )
}

function references(): HTMLElement {
  return screen.getByRole('dialog', { name: 'References of row 1' })
}

function referenceItem(index: number): HTMLElement {
  const item = within(references()).getAllByRole('listitem').at(index)
  if (item === undefined) {
    throw new Error(`no reference ${String(index)}`)
  }
  return item
}

describe('the menu of a cell', () => {
  it('should offer the link of the cell, the references of its row, copy and its whole value', () => {
    linked({ canRefresh: true, queryBox: TABLE_BOX })

    fireEvent.contextMenu(cellAt(0, 1), { clientX: 30, clientY: 40 })

    expect(menuItems()).toStrictEqual([
      'Open Referenced Row',
      'Open Referenced Row Here',
      'Peek Referenced Row',
      'Rows That Reference This Row…',
      'Copy',
      'Show Whole Value',
    ])
    expect(screen.getByRole('menu', { name: 'Cell actions' }).style.top).toBe('40px')
    expect(theGrid().getAttribute('aria-activedescendant')).toBe('cell-tab-1-0-1')
  })

  it('should offer less on a cell that is no link, in a result that is not a table', () => {
    linked({ references: [] })

    fireEvent.contextMenu(cellAt(1, 1))

    expect(menuItems()).toStrictEqual(['Copy', 'Show Whole Value'])
  })

  it('should open, peek, copy and show the whole value from the menu', () => {
    linked()
    fireEvent.contextMenu(cellAt(0, 1))
    expect(menuItems()).not.toContain('Open Referenced Row Here')
    pick('Open Referenced Row')
    fireEvent.contextMenu(cellAt(0, 1))
    pick('Peek Referenced Row')
    fireEvent.contextMenu(cellAt(0, 1))
    pick('Copy')
    fireEvent.contextMenu(cellAt(0, 1))
    pick('Show Whole Value')

    expect(view.sent('navigate')).toHaveLength(1)
    expect(view.sent('peek')).toHaveLength(1)
    expect(view.sent('copy')).toStrictEqual([
      {
        type: 'copy',
        tabId: 'tab-1',
        viewVersion: 0,
        block: { firstRow: 0, lastRow: 0, columns: [1] },
        format: 'tsv',
      },
    ])
    expect(screen.getByRole('complementary', { name: /name/ }).textContent).toContain('ann')
  })

  it('should open the menu from the keyboard', () => {
    linked()
    fireEvent.mouseDown(cellAt(0, 1))

    fireEvent.keyDown(theGrid(), { key: 'ContextMenu' })

    expect(menuItems()).toContain('Copy')
  })
})

describe('the rows that reference a row', () => {
  it('should list the referencing tables of the selected row from the toolbar', () => {
    linked()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'References' }).disabled).toBe(
      true,
    )
    fireEvent.mouseDown(cellAt(0, 1))

    fireEvent.click(screen.getByRole('button', { name: 'References' }))

    expect(references().textContent).toBe(
      'Rows that reference row 1orders (customer_id)Opennotes (customer_id)OpenCount Rows',
    )
  })

  it('should count them on demand and show the counts the host gives', () => {
    linked()
    fireEvent.contextMenu(cellAt(0, 1))
    pick('Rows That Reference This Row…')

    fireEvent.click(within(references()).getByRole('button', { name: 'Count Rows' }))
    view.rerender({ changes: LINKED, answers: { counts: COUNTS } })

    expect(view.sent('countReferences')).toStrictEqual([
      { type: 'countReferences', tabId: 'tab-1', viewVersion: 0, row: 0 },
    ])
    expect(
      within(references())
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.reference-count')?.textContent),
    ).toStrictEqual(['12,345 rows', '?'])
  })

  it('should open the rows of a referencing table, here in a table panel', () => {
    linked({ canRefresh: true, queryBox: TABLE_BOX })
    fireEvent.contextMenu(cellAt(0, 1))
    pick('Rows That Reference This Row…')

    fireEvent.click(within(referenceItem(0)).getByRole('button', { name: 'Here' }))
    fireEvent.contextMenu(cellAt(0, 1))
    pick('Rows That Reference This Row…')
    fireEvent.click(within(referenceItem(1)).getByRole('button', { name: 'Open' }))

    const start = { type: 'openReference', tabId: 'tab-1', viewVersion: 0, row: 0 }
    expect(view.sent('openReference')).toStrictEqual([
      { ...start, isInPlace: true, reference: 0 },
      { ...start, isInPlace: false, reference: 1 },
    ])
  })

  it('should not take counts for another row', () => {
    linked()
    fireEvent.contextMenu(cellAt(2, 1))
    pick('Rows That Reference This Row…')

    view.rerender({ changes: LINKED, answers: { counts: COUNTS } })

    expect(
      screen.getByRole('dialog', { name: 'References of row 3' }).querySelector('.reference-count')
        ?.textContent,
    ).toBe('')
  })
})
