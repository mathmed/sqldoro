import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { gridView, type GridView } from '../../test/webview/grid-view.ts'
import { cellAt, theGrid } from '../../test/webview/grid.ts'
import { ColumnKind } from '../core/engine/query.ts'
import { type GridSelection, selectCell } from '../core/grid/selection.ts'
import type { ResultTab } from '../core/results/protocol.ts'

const WIDE_COLUMNS = Array.from(Array(8).keys(), (index) => ({
  name: `description_${String(index)}`,
  dataType: 'TEXT',
  kind: ColumnKind.Text,
}))
// Columns named with four characters are 4 × 8 + 96 pixels wide.
const NUMBERED_WIDTH = 128

let view: GridView

function grid(changes: Partial<ResultTab> = {}, selection?: GridSelection): void {
  view = gridView(changes, { selection })
}

function rowNumber(row: number): HTMLElement {
  const found = screen.getAllByRole('rowheader').at(row)
  if (found === undefined) {
    throw new Error(`no row number ${String(row)}`)
  }
  return found
}

function columnNames(): (string | null | undefined)[] {
  return screen
    .getAllByRole('columnheader')
    .map((header) => header.querySelector('.column-name')?.textContent)
}

describe('Grid', () => {
  it('should select a cell on a click, and extend the selection with Shift', () => {
    grid({}, selectCell({ row: 0, column: 0 }))

    fireEvent.mouseDown(cellAt(2, 1), { shiftKey: true })
    fireEvent.mouseDown(cellAt(3, 0))

    expect(view.handlers.onSelect.mock.calls).toStrictEqual([
      [{ anchor: { row: 0, column: 0 }, focus: { row: 2, column: 1 } }],
      [selectCell({ row: 3, column: 0 })],
    ])
  })

  it('should start a selection on a click with Shift when nothing is selected', () => {
    grid()

    fireEvent.mouseDown(cellAt(1, 1), { shiftKey: true })

    expect(view.handlers.onSelect).toHaveBeenCalledWith(selectCell({ row: 1, column: 1 }))
  })

  it('should mark the selected cells and the focus', () => {
    grid({}, { anchor: { row: 0, column: 0 }, focus: { row: 1, column: 1 } })

    expect([cellAt(0, 0), cellAt(1, 1), cellAt(2, 0)].map((cell) => cell.className)).toStrictEqual([
      'grid-cell look-number selected',
      'grid-cell look-null selected focused',
      'grid-cell look-number',
    ])
    expect(theGrid().getAttribute('aria-activedescendant')).toBe('cell-tab-1-1-1')
  })

  it('should number the rows on the left, the rows of the selection marked', () => {
    grid({}, { anchor: { row: 1, column: 0 }, focus: { row: 2, column: 0 } })

    const numbers = screen.getAllByRole('rowheader')
    expect(numbers.map((number) => number.textContent)).toStrictEqual(['1', '2', '3', '4'])
    expect(numbers.map((number) => number.className)).toStrictEqual([
      'row-number',
      'row-number selected',
      'row-number selected',
      'row-number',
    ])
    expect(numbers[0]?.getAttribute('aria-colindex')).toBe('1')
    expect(cellAt(0, 0).getAttribute('aria-colindex')).toBe('2')
    expect(theGrid().getAttribute('aria-colcount')).toBe('3')
  })

  it('should select a whole row from its number, and whole rows up to it with Shift', () => {
    grid({}, selectCell({ row: 1, column: 1 }))
    fireEvent.mouseDown(rowNumber(2))
    fireEvent.mouseDown(rowNumber(3), { shiftKey: true })

    expect(view.handlers.onSelect.mock.calls).toStrictEqual([
      [{ anchor: { row: 2, column: 0 }, focus: { row: 2, column: 1 } }],
      [{ anchor: { row: 1, column: 0 }, focus: { row: 3, column: 1 } }],
    ])
  })

  it('should select one row from its number with Shift when nothing is selected', () => {
    grid()

    fireEvent.mouseDown(rowNumber(0), { shiftKey: true })

    expect(view.handlers.onSelect).toHaveBeenCalledWith({
      anchor: { row: 0, column: 0 },
      focus: { row: 0, column: 1 },
    })
  })

  it('should move with the keyboard, a page at a time, showing the cell with the focus', () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollTo')
    grid({ columns: WIDE_COLUMNS, rowCount: 100 }, selectCell({ row: 0, column: 6 }))

    fireEvent.keyDown(theGrid(), { key: 'ArrowRight' })
    fireEvent.keyDown(theGrid(), { key: 'PageDown' })

    expect(view.handlers.onSelect.mock.calls).toStrictEqual([
      [selectCell({ row: 0, column: 7 })],
      [selectCell({ row: 23, column: 6 })],
    ])
    // Eight columns of 200 pixels, in 800 pixels less the 40 of the row numbers.
    expect(scroll).toHaveBeenCalledWith({ left: 8 * 200 - (800 - 40) })
  })

  it('should put only the columns in view of a wide result in the page, and follow the scroll', async () => {
    const columns = Array.from(Array(500).keys(), (index) => ({
      name: `c${String(index).padStart(3, '0')}`,
      dataType: 'INT',
      kind: ColumnKind.Number,
    }))
    grid({ columns })

    expect(columnNames()).toStrictEqual(columns.slice(0, 9).map((column) => column.name))
    expect(document.getElementById('cell-tab-1-0-499')).toBeNull()
    Object.defineProperty(theGrid(), 'scrollLeft', { configurable: true, value: 128 * 494 })
    fireEvent.scroll(theGrid())

    await vi.waitFor(() => {
      expect(columnNames().at(-1)).toBe('c499')
    })
    expect(cellAt(0, 499).getAttribute('aria-colindex')).toBe('501')
    const first = Number(columnNames().at(0)?.slice(1))
    expect(cellAt(0, first).previousElementSibling?.getAttribute('style')).toBe(
      `width: ${String(NUMBERED_WIDTH * first)}px;`,
    )
  })

  it('should copy and open the value of a cell from the keyboard, or with a double click', () => {
    grid({}, selectCell({ row: 1, column: 1 }))

    fireEvent.keyDown(theGrid(), { key: 'c', ctrlKey: true })
    fireEvent.keyDown(theGrid(), { key: 'Enter' })
    fireEvent.doubleClick(cellAt(2, 0))

    expect(view.handlers.onCopy).toHaveBeenCalledWith('tsv')
    expect(view.handlers.onOpenDetail.mock.calls).toStrictEqual([
      [{ row: 1, column: 1 }],
      [{ row: 2, column: 0 }],
    ])
  })

  it('should ask the host for the rows in view it does not hold yet', () => {
    grid({ rowCount: 1000 })

    expect(view.api.posted()).toStrictEqual([
      { type: 'fetchRows', tabId: 'tab-1', viewVersion: 0, start: 0, count: 200 },
    ])
  })

  it('should scroll the rows of a step of a trail back to where they were, and keep where they go', () => {
    const scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTo')
    const scrolls = new Map([[3, 240]])
    view = gridView({}, { step: 3, scrolls })

    expect(scrollTo).toHaveBeenCalledWith({ top: 240 })
    Object.defineProperty(theGrid(), 'scrollTop', { configurable: true, value: 96 })
    fireEvent.scroll(theGrid())

    expect(scrolls.get(3)).toBe(96)
    scrollTo.mockRestore()
  })

  it('should keep no scroll for rows outside a trail, nor for a step never left', () => {
    const scrolls = new Map<number, number>()
    view = gridView({}, { scrolls })
    fireEvent.scroll(theGrid())
    gridView({}, { step: 4, scrolls })

    expect(scrolls.size).toBe(0)
  })
})
