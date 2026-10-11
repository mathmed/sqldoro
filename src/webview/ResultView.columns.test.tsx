import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RESULT_COLUMNS } from '../../test/fixtures/results.ts'
import { cellAt, pickFromMenu } from '../../test/webview/grid.ts'
import { shownView, type ShownView } from '../../test/webview/result-view.ts'
import { ColumnKind } from '../core/engine/query.ts'
import type { ColumnLayout } from '../core/grid/column-layout.ts'
import type { ResultTab } from '../core/results/protocol.ts'

// id, name, then a second name the rows hold no value for: the keys tell the two names apart.
const COLUMNS = [...RESULT_COLUMNS, { name: 'name', dataType: 'TEXT', kind: ColumnKind.Text }]

let view: ShownView

function columns(layout: ColumnLayout, changes: Partial<ResultTab> = {}): void {
  view = shownView({ changes: { columns: COLUMNS, layout, ...changes } })
}

function headers(): (string | null | undefined)[] {
  return screen
    .getAllByRole('columnheader')
    .map((header) => header.querySelector('.column-name')?.textContent)
}

function panel(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Columns' })
}

function layouts(): unknown[] {
  return view.sent('setLayout').map((message) => ('layout' in message ? message.layout : null))
}

function listed(): (string | null | undefined)[] {
  return within(panel())
    .getAllByRole('listitem')
    .map((entry) => entry.querySelector('.column-name')?.textContent)
}

function item(index: number): HTMLElement {
  return nth(within(panel()).getAllByRole('listitem'), index)
}

function checkbox(index: number): HTMLElement {
  return nth(within(panel()).getAllByRole('checkbox'), index)
}

function nth(elements: readonly HTMLElement[], index: number): HTMLElement {
  const element = elements.at(index)
  if (element === undefined) {
    throw new Error(`no element ${String(index)}`)
  }
  return element
}

describe('the columns a result shows', () => {
  it('should show the columns of the layout, in its order, and say how many are hidden', () => {
    columns({ order: ['name#2', 'id'], hidden: ['name'] })

    expect(headers()).toStrictEqual(['name', 'id'])
    expect(cellAt(0, 0).textContent).toBe('NULL')
    expect(cellAt(0, 1).textContent).toBe('1')
    expect(screen.getByRole('button', { name: '1 column hidden' })).toBeDefined()
  })

  it('should copy the columns shown, in their order', () => {
    columns({ order: ['name', 'id'], hidden: ['name#2'] })
    fireEvent.mouseDown(cellAt(0, 0))
    fireEvent.mouseDown(cellAt(0, 1), { shiftKey: true })

    pickFromMenu('Copy the selection', 'Copy as CSV')

    expect(view.sent('copy')).toStrictEqual([
      {
        type: 'copy',
        tabId: 'tab-1',
        viewVersion: 0,
        block: { firstRow: 0, lastRow: 0, columns: [1, 0] },
        format: 'csv',
      },
    ])
  })

  it('should hide a column from its header', () => {
    columns({ order: [], hidden: [] })

    pickFromMenu('Actions of id', 'Hide column')

    expect(layouts()).toStrictEqual([{ order: [], hidden: ['id'] }])
  })

  it('should offer every column back when all are hidden', () => {
    columns({ order: ['id'], hidden: ['id', 'name', 'name#2'] })
    expect(screen.queryByRole('grid')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show All Columns' }))

    expect(layouts()).toStrictEqual([{ order: ['id'], hidden: [] }])
  })
})

describe('the Columns panel', () => {
  it('should open from the toolbar or the note of hidden columns, every column listed', () => {
    columns({ order: ['name#2'], hidden: ['name'] })

    fireEvent.click(screen.getByRole('button', { name: '1 column hidden' }))
    expect(listed()).toStrictEqual(['name#2', 'id', 'name'])
    fireEvent.keyDown(panel(), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Columns' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))

    expect(
      within(panel())
        .getAllByRole<HTMLInputElement>('checkbox')
        .map((box) => box.checked),
    ).toStrictEqual([true, true, false])
    expect(panel().textContent).toContain('Copy and export take the columns shown, in this order.')
  })

  it('should show and hide columns, all of them, none, or the others', () => {
    columns({ order: [], hidden: ['name'] })
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))

    fireEvent.click(checkbox(0))
    fireEvent.click(checkbox(1))
    for (const action of ['All', 'None', 'Invert', 'Reset']) {
      fireEvent.click(within(panel()).getByRole('button', { name: action }))
    }

    expect(layouts()).toStrictEqual([
      { order: [], hidden: ['name', 'id'] },
      { order: [], hidden: [] },
      { order: [], hidden: [] },
      { order: [], hidden: ['id', 'name', 'name#2'] },
      { order: [], hidden: ['id', 'name#2'] },
      { order: [], hidden: [] },
    ])
  })

  it('should find a column by its name, and move columns only in the whole list', () => {
    columns({ order: [], hidden: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))

    fireEvent.change(within(panel()).getByRole('searchbox'), { target: { value: 'NAM' } })

    expect(listed()).toStrictEqual(['name', 'name#2'])
    expect(item(0).getAttribute('draggable')).toBe('false')
    fireEvent.keyDown(item(0), { key: 'ArrowDown', altKey: true })
    expect(layouts()).toStrictEqual([])
  })

  it('should move a column with Alt+Up and Alt+Down, or by dragging it', () => {
    columns({ order: [], hidden: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))

    fireEvent.keyDown(item(0), { key: 'ArrowDown', altKey: true })
    fireEvent.keyDown(item(0), { key: 'ArrowDown' })
    fireEvent.keyDown(item(2), { key: 'ArrowUp', altKey: true })
    fireEvent.dragStart(item(2))
    expect(item(2).className).toBe('column-item dragging')
    fireEvent.dragOver(item(0))
    fireEvent.drop(item(0))
    fireEvent.drop(item(1))
    fireEvent.dragStart(item(1))
    fireEvent.dragEnd(item(1))

    expect(layouts()).toStrictEqual([
      { order: ['name', 'id', 'name#2'], hidden: [] },
      { order: ['id', 'name#2', 'name'], hidden: [] },
      { order: ['name#2', 'id', 'name'], hidden: [] },
    ])
    expect(item(1).className).toBe('column-item')
  })

  it('should ask the host for the values of the column a filter lists', () => {
    columns({ order: ['name', 'id'], hidden: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Filter id' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Operator' }), {
      target: { value: 'inList' },
    })

    expect(view.sent('fetchDistinct')).toStrictEqual([
      { type: 'fetchDistinct', tabId: 'tab-1', column: 0 },
    ])
  })
})
