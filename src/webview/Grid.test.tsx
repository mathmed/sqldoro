import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import { cellAt, GRID_ROWS, theGrid } from '../../test/webview/grid.ts'
import { type FakeVsCodeApi, fakeVsCodeApi } from '../../test/webview/vscode-api.ts'
import { ColumnKind } from '../core/engine/query.ts'
import { type GridSelection, selectCell } from '../core/grid/selection.ts'
import type { CellPosition } from '../core/grid/selection.ts'
import type { ExportFormat } from '../core/results/export-format.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import type { ViewSpec } from '../core/results/view.ts'
import { Grid } from './Grid.tsx'
import { RowStore } from './row-store.ts'

interface Handlers {
  readonly onSelect: Mock<(selection: GridSelection) => void>
  readonly onOpenDetail: Mock<(position: CellPosition) => void>
  readonly onView: Mock<(view: ViewSpec) => void>
  readonly onCopy: Mock<(format: ExportFormat) => void>
}

const WIDE_COLUMNS = Array.from(Array(8).keys(), (index) => ({
  name: `description_${String(index)}`,
  dataType: 'TEXT',
  kind: ColumnKind.Text,
}))

let api: FakeVsCodeApi
let store: RowStore
let handlers: Handlers

function grid(changes: Partial<ResultTab> = {}, selection?: GridSelection): void {
  render(
    <Grid
      api={api}
      tab={resultTab({ rowCount: 4, loadedRows: 4, ...changes })}
      store={store}
      selection={selection}
      {...handlers}
    />,
  )
  act(() => {
    store.store(0, 0, GRID_ROWS)
  })
}

function views(): ViewSpec[] {
  return handlers.onView.mock.calls.map(([view]) => view)
}

beforeEach(() => {
  api = fakeVsCodeApi()
  store = new RowStore()
  handlers = { onSelect: vi.fn(), onOpenDetail: vi.fn(), onView: vi.fn(), onCopy: vi.fn() }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Grid', () => {
  it('should select a cell on a click, and extend the selection with Shift', () => {
    grid({}, selectCell({ row: 0, column: 0 }))

    fireEvent.mouseDown(cellAt(2, 1), { shiftKey: true })
    fireEvent.mouseDown(cellAt(3, 0))

    expect(handlers.onSelect.mock.calls).toStrictEqual([
      [{ anchor: { row: 0, column: 0 }, focus: { row: 2, column: 1 } }],
      [selectCell({ row: 3, column: 0 })],
    ])
  })

  it('should start a selection on a click with Shift when nothing is selected', () => {
    grid()

    fireEvent.mouseDown(cellAt(1, 1), { shiftKey: true })

    expect(handlers.onSelect).toHaveBeenCalledWith(selectCell({ row: 1, column: 1 }))
  })

  it('should mark the selected cells and the focus', () => {
    grid({}, { anchor: { row: 0, column: 0 }, focus: { row: 1, column: 1 } })

    expect([cellAt(0, 0), cellAt(1, 1), cellAt(2, 0)].map((cell) => cell.className)).toStrictEqual([
      'grid-cell look-number selected ',
      'grid-cell look-null selected focused',
      'grid-cell look-number  ',
    ])
    expect(theGrid().getAttribute('aria-activedescendant')).toBe('cell-tab-1-1-1')
  })

  it('should move with the keyboard, a page at a time, showing the cell with the focus', () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollTo')
    grid({ columns: WIDE_COLUMNS, rowCount: 100 }, selectCell({ row: 0, column: 6 }))

    fireEvent.keyDown(theGrid(), { key: 'ArrowRight' })
    fireEvent.keyDown(theGrid(), { key: 'PageDown' })

    expect(handlers.onSelect.mock.calls).toStrictEqual([
      [selectCell({ row: 0, column: 7 })],
      [selectCell({ row: 23, column: 6 })],
    ])
    expect(scroll).toHaveBeenCalledWith({ left: 352 })
  })

  it('should copy and open the value of a cell from the keyboard, or with a double click', () => {
    grid({}, selectCell({ row: 1, column: 1 }))

    fireEvent.keyDown(theGrid(), { key: 'c', ctrlKey: true })
    fireEvent.keyDown(theGrid(), { key: 'Enter' })
    fireEvent.doubleClick(cellAt(2, 0))

    expect(handlers.onCopy).toHaveBeenCalledWith('tsv')
    expect(handlers.onOpenDetail.mock.calls).toStrictEqual([
      [{ row: 1, column: 1 }],
      [{ row: 2, column: 0 }],
    ])
  })

  it('should sort by a column, ascending first, and turn a sort around', () => {
    grid({ view: { sort: [{ column: 1, isDescending: false }], filters: [] } })

    fireEvent.click(screen.getByRole('button', { name: 'id' }))
    fireEvent.click(screen.getByRole('button', { name: /^name/ }))

    expect(views()).toStrictEqual([
      { sort: [{ column: 0, isDescending: false }], filters: [] },
      { sort: [{ column: 1, isDescending: true }], filters: [] },
    ])
  })

  it('should sort by several columns with Shift', () => {
    grid({ view: { sort: [{ column: 0, isDescending: false }], filters: [] } })

    fireEvent.click(screen.getByRole('button', { name: 'name' }), { shiftKey: true })

    expect(views()).toStrictEqual([
      {
        sort: [
          { column: 0, isDescending: false },
          { column: 1, isDescending: false },
        ],
        filters: [],
      },
    ])
  })

  it('should show the sort in the headers', () => {
    grid({
      view: {
        sort: [
          { column: 0, isDescending: true },
          { column: 1, isDescending: false },
        ],
        filters: [],
      },
    })

    expect(
      screen
        .getAllByRole('columnheader')
        .map((header) => [header.getAttribute('aria-sort'), header.textContent]),
    ).toStrictEqual([
      ['descending', 'id ▼'],
      ['ascending', 'name ▲'],
    ])
  })

  it('should filter a column after a pause, or at once with Enter', () => {
    vi.useFakeTimers()
    grid({ view: { sort: [], filters: [{ column: 1, text: 'b' }] } })
    const name = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Filter name' })
    const id = screen.getByRole('searchbox', { name: 'Filter id' })
    expect(name.value).toBe('b')

    fireEvent.change(name, { target: { value: 'an' } })
    act(() => {
      vi.advanceTimersByTime(399)
    })
    expect(views()).toStrictEqual([])
    act(() => {
      vi.advanceTimersByTime(1)
    })
    fireEvent.keyDown(id, { key: 'Enter' })
    fireEvent.change(id, { target: { value: '7' } })
    fireEvent.keyDown(id, { key: 'a' })
    fireEvent.keyDown(id, { key: 'Enter' })

    expect(views()).toStrictEqual([
      { sort: [], filters: [{ column: 1, text: 'an' }] },
      {
        sort: [],
        filters: [
          { column: 1, text: 'b' },
          { column: 0, text: '7' },
        ],
      },
    ])
  })

  it('should lock the sort and the filters while the statement runs', () => {
    grid({ status: 'running', summary: null })

    expect(screen.getByRole<HTMLInputElement>('searchbox', { name: 'Filter id' }).disabled).toBe(
      true,
    )
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'id' }).disabled).toBe(true)
  })

  it('should resize a column by dragging its edge', () => {
    grid()
    const header = screen.getAllByRole('columnheader')[1]
    const separator = screen.getAllByRole('separator', { name: 'Resize the column' })[1]
    if (header === undefined || separator === undefined) {
      throw new Error('no second column')
    }
    const before = Number.parseInt(header.style.width, 10)

    fireEvent.mouseDown(separator, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 160 })
    fireEvent.mouseUp(document, { clientX: 160 })

    expect(Number.parseInt(header.style.width, 10)).toBe(before + 60)
    expect(cellAt(0, 1).style.width).toBe(`${String(before + 60)}px`)
  })

  it('should ask the host for the rows in view it does not hold yet', () => {
    grid({ rowCount: 1000 })

    expect(api.posted()).toStrictEqual([
      { type: 'fetchRows', tabId: 'tab-1', viewVersion: 0, start: 0, count: 200 },
    ])
  })
})
