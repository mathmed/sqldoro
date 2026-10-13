import { act, fireEvent, render, screen } from '@testing-library/react'
import type { JSX } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import {
  cellAt,
  GRID_ROWS,
  isOff,
  LONG_TEXT,
  pickFromMenu,
  theGrid,
} from '../../test/webview/grid.ts'
import { type FakeVsCodeApi, fakeVsCodeApi } from '../../test/webview/vscode-api.ts'
import type { CellMessage, ResultTab } from '../core/results/protocol.ts'
import { NO_ANSWERS } from './host-answers.ts'
import { ResultView } from './ResultView.tsx'
import { RowStore } from './row-store.ts'
import { WaitIndicator } from './wait-indicator.ts'

let api: FakeVsCodeApi
let store: RowStore
let indicator: WaitIndicator

function element(changes: Partial<ResultTab> = {}, answer?: CellMessage): JSX.Element {
  return (
    <ResultView
      tab={resultTab({ rowCount: 4, loadedRows: 4, ...changes })}
      incoming={undefined}
      store={store}
      api={api}
      answers={{ ...NO_ANSWERS, cell: answer }}
      context={{
        connection: null,
        sql: null,
        step: null,
        scrolls: new Map(),
        indicator,
        queryMode: { isOn: false, toggle: () => undefined },
      }}
      hasTabs={false}
    />
  )
}

function view(changes: Partial<ResultTab> = {}, answer?: CellMessage): ReturnType<typeof render> {
  const rendered = render(element(changes, answer))
  act(() => {
    store.store(0, 0, GRID_ROWS)
  })
  return rendered
}

function sent(type: string): unknown[] {
  return api.posted().filter((message) => message.type === type)
}

beforeEach(() => {
  api = fakeVsCodeApi()
  store = new RowStore()
  indicator = new WaitIndicator()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ResultView', () => {
  it('should show the rows, NULL apart from empty, and a mark on a cut value', () => {
    view()

    expect(theGrid().getAttribute('aria-rowcount')).toBe('5')
    expect(
      screen
        .getAllByRole('columnheader')
        .map((header) => header.querySelector('.column-name')?.textContent),
    ).toStrictEqual(['id', 'name'])
    expect([0, 1, 2, 3].map((row) => cellAt(row, 1).textContent)).toStrictEqual([
      'ann',
      'NULL',
      'empty',
      `${LONG_TEXT}…`,
    ])
  })

  it('should show rows that are not here yet as loading', () => {
    render(element({ rowCount: 300 }))

    expect(screen.getAllByRole('row')[1]?.className).toBe('grid-row loading')
    expect(cellAt(0, 1).className).toBe('grid-cell look-loading')
  })

  it('should copy the selection in the format picked, from the toolbar or the keyboard', () => {
    view()

    fireEvent.mouseDown(cellAt(0, 0))
    fireEvent.mouseDown(cellAt(1, 1), { shiftKey: true })
    fireEvent.keyDown(theGrid(), { key: 'c', ctrlKey: true })
    pickFromMenu('Copy Selection', 'Copy as JSON')

    const block = { firstRow: 0, lastRow: 1, columns: [0, 1] }
    expect(sent('copy')).toStrictEqual([
      { type: 'copy', tabId: 'tab-1', viewVersion: 0, block, format: 'tsv' },
      { type: 'copy', tabId: 'tab-1', viewVersion: 0, block, format: 'json' },
    ])
  })

  it('should copy nothing without a selection', () => {
    view()

    fireEvent.keyDown(theGrid(), { key: 'c', ctrlKey: true })

    expect(sent('copy')).toStrictEqual([])
    expect(isOff(screen.getByRole('button', { name: 'Copy Selection' }))).toBe(true)
  })

  it('should keep the selection inside rows that shrink, and drop it without rows', () => {
    const { rerender } = view()
    fireEvent.mouseDown(cellAt(3, 1))

    rerender(element({ rowCount: 2 }))
    expect(theGrid().getAttribute('aria-activedescendant')).toBe('cell-tab-1-1-1')

    rerender(element({ rowCount: 0 }))
    expect(theGrid().hasAttribute('aria-activedescendant')).toBe(false)
  })

  it('should show the whole value of a cell, asking the host for a value it cut', () => {
    const { rerender } = view()

    fireEvent.doubleClick(cellAt(0, 1))
    expect(screen.getByLabelText('Value of name').textContent).toContain('ann')
    fireEvent.doubleClick(cellAt(1, 1))
    expect(screen.getByLabelText('Value of name').textContent).toContain('NULL')
    expect(sent('fetchCell')).toStrictEqual([])

    fireEvent.doubleClick(cellAt(3, 1))
    expect(screen.getByText('Loading…')).toBeDefined()
    expect(sent('fetchCell')).toStrictEqual([
      { type: 'fetchCell', tabId: 'tab-1', viewVersion: 0, row: 3, column: 1 },
    ])

    const place = { tabId: 'tab-1', viewVersion: 0, row: 3, column: 1 }
    rerender(element({}, { type: 'cell', ...place, value: 'whole value' }))
    expect(screen.getByText('whole value')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Close the value' }))
    expect(screen.queryByLabelText('Value of name')).toBeNull()
  })

  it('should ask the host for a cell it has not sent yet', () => {
    render(element({ rowCount: 300 }))

    fireEvent.doubleClick(cellAt(10, 0))

    expect(sent('fetchCell')).toStrictEqual([
      { type: 'fetchCell', tabId: 'tab-1', viewVersion: 0, row: 10, column: 0 },
    ])
  })

  it.each([
    { tabId: 'other', viewVersion: 0, row: 3, column: 1 },
    { tabId: 'tab-1', viewVersion: 9, row: 3, column: 1 },
    { tabId: 'tab-1', viewVersion: 0, row: 2, column: 1 },
    { tabId: 'tab-1', viewVersion: 0, row: 3, column: 0 },
  ])('should not show a value sent for another cell: %j', (place) => {
    view({}, { type: 'cell', value: 'not this one', ...place })

    fireEvent.doubleClick(cellAt(3, 1))

    expect(screen.getByText('Loading…')).toBeDefined()
  })

  it('should close the value of a column that is gone', () => {
    const { rerender } = view()
    fireEvent.doubleClick(cellAt(0, 1))

    rerender(element({ columns: [{ name: 'id', dataType: 'INT8', kind: 'number' }] }))

    expect(screen.queryByLabelText('Value of name')).toBeNull()
  })

  it('should change the view here, or on the server once asked', () => {
    view()

    fireEvent.click(screen.getByRole('button', { name: 'id' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sort and Filter on the Server' }))
    fireEvent.click(screen.getByRole('button', { name: 'name' }))

    expect(sent('setView')).toStrictEqual([
      {
        type: 'setView',
        tabId: 'tab-1',
        view: { sort: [{ column: 0, isDescending: false }], filters: [] },
        isServerSide: false,
      },
      {
        type: 'setView',
        tabId: 'tab-1',
        view: { sort: [{ column: 1, isDescending: false }], filters: [] },
        isServerSide: true,
      },
    ])
  })

  it('should start with the server view of a tab sorted by the server', () => {
    view({ isServerView: true })

    expect(
      screen
        .getByRole('button', { name: 'Sort and Filter on the Server' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('should cancel a statement that runs, and change no view meanwhile', () => {
    const { rerender } = view()
    fireEvent.click(screen.getByRole('button', { name: 'Filter name' }))
    rerender(element({ status: 'running', summary: null }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Query' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Value of name' }), {
      key: 'Enter',
    })

    expect(sent('cancel')).toStrictEqual([{ type: 'cancel' }])
    expect(sent('setView')).toStrictEqual([])
  })

  it('should ask the host to read the rows of a table again', () => {
    view({ canRefresh: true })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(sent('refresh')).toStrictEqual([{ type: 'refresh', tabId: 'tab-1' }])
  })

  it('should export the result', () => {
    view()

    pickFromMenu('Export Result', 'Export as SQL…')

    expect(sent('export')).toStrictEqual([{ type: 'export', tabId: 'tab-1', format: 'sql' }])
  })

  it('should show the plan of an EXPLAIN, and no grid for a statement without columns', () => {
    const { unmount } = view({ kind: 'plan', plan: ['Seq Scan on t'] })
    expect(screen.getByLabelText('Query plan').textContent).toBe('Seq Scan on t')
    expect(screen.queryByRole('grid')).toBeNull()
    unmount()

    view({
      columns: [],
      summary: { durationMs: 1, affectedRows: 3, isTruncated: false, autoLimit: null },
    })
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('3 rows affected in 1 ms')
  })
})
