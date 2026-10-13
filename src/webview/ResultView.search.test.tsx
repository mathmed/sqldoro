import { act, fireEvent, render, screen } from '@testing-library/react'
import type { JSX } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import { isOff } from '../../test/webview/grid.ts'
import { type FakeVsCodeApi, fakeVsCodeApi } from '../../test/webview/vscode-api.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import { NO_ANSWERS } from './host-answers.ts'
import { ResultView } from './ResultView.tsx'
import { RowStore } from './row-store.ts'
import { WaitIndicator } from './wait-indicator.ts'

let api: FakeVsCodeApi
let store: RowStore
let indicator: WaitIndicator

function element(changes: Partial<ResultTab> = {}): JSX.Element {
  return (
    <ResultView
      tab={resultTab({ rowCount: 4, loadedRows: 4, ...changes })}
      incoming={undefined}
      store={store}
      api={api}
      answers={NO_ANSWERS}
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

function sent(type: string): unknown[] {
  return api.posted().filter((message) => message.type === type)
}

function search(): HTMLInputElement {
  return screen.getByRole('searchbox', { name: 'Quick Search' })
}

function where(): HTMLInputElement {
  return screen.getByRole('combobox', { name: 'WHERE condition' })
}

function clearWhere(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Clear the WHERE condition' })
}

beforeEach(() => {
  api = fakeVsCodeApi()
  store = new RowStore()
  indicator = new WaitIndicator()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ResultView, the quick search', () => {
  it('should search the rows after a pause, once for the same text', () => {
    vi.useFakeTimers()
    const { rerender } = render(element())

    fireEvent.change(search(), { target: { value: 'an' } })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender(element({ loadedRows: 5 }))
    act(() => {
      vi.advanceTimersByTime(199)
    })
    expect(sent('search')).toStrictEqual([])
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(sent('search')).toHaveLength(1)
    fireEvent.keyDown(search(), { key: 'Enter' })

    expect(sent('search')).toStrictEqual([{ type: 'search', tabId: 'tab-1', text: 'an' }])
  })

  it('should search at once with Enter, and clear the search with Escape', () => {
    vi.useFakeTimers()
    render(element())

    fireEvent.change(search(), { target: { value: 'bob' } })
    fireEvent.keyDown(search(), { key: 'Enter' })
    fireEvent.keyDown(search(), { key: 'a' })
    fireEvent.keyDown(search(), { key: 'Escape' })
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(sent('search')).toStrictEqual([
      { type: 'search', tabId: 'tab-1', text: 'bob' },
      { type: 'search', tabId: 'tab-1', text: '' },
    ])
    expect(search().value).toBe('')
  })

  it('should say how many rows match, and of how many fetched rows when the result is limited', () => {
    const { rerender } = render(element({ search: 'ann', rowCount: 1 }))
    expect(search().value).toBe('ann')
    expect(screen.getByText('1 match')).toBeDefined()

    rerender(
      element({
        search: 'ann',
        rowCount: 12,
        loadedRows: 1000,
        summary: { durationMs: 1, affectedRows: null, isTruncated: true, autoLimit: 1000 },
      }),
    )

    expect(screen.getByText('12 matches in the first 1,000 rows')).toBeDefined()
    expect(search().title).toContain('It searches the rows sqldoro fetched')
  })

  it('should not count matches without a search, nor search while the statement runs', () => {
    render(element({ status: 'running', summary: null }))

    expect(screen.queryByText(/match/)).toBeNull()
    expect(search().disabled).toBe(true)
  })
})

describe('ResultView, the WHERE of a table', () => {
  it('should be offered only for the rows of a table', () => {
    render(element())

    expect(screen.queryByRole('combobox', { name: 'WHERE condition' })).toBeNull()
  })

  it('should read the table with the condition typed when Enter is pressed', () => {
    render(element({ canRefresh: true }))
    expect(where().placeholder).toBe("SQL filter (e.g. status = 'active')")
    expect(screen.getByText('WHERE')).toBeDefined()
    expect(clearWhere()).toBeNull()

    fireEvent.change(where(), { target: { value: " status = 'open' " } })
    fireEvent.keyDown(where(), { key: 'a' })
    fireEvent.keyDown(where(), { key: 'Enter' })

    expect(sent('filterTable')).toStrictEqual([
      { type: 'filterTable', tabId: 'tab-1', condition: " status = 'open' " },
    ])
  })

  it('should not read the table again for the condition it was read with', () => {
    render(element({ canRefresh: true, tableFilter: "status = 'open'" }))
    expect(where().value).toBe("status = 'open'")

    fireEvent.change(where(), { target: { value: "status = 'open'  " } })
    fireEvent.keyDown(where(), { key: 'Enter' })

    expect(sent('filterTable')).toStrictEqual([])
  })

  it('should read every row again once the condition is cleared', () => {
    render(element({ canRefresh: true, tableFilter: 'id > 1' }))

    fireEvent.click(screen.getByRole('button', { name: 'Clear the WHERE condition' }))

    expect(sent('filterTable')).toStrictEqual([
      { type: 'filterTable', tabId: 'tab-1', condition: '' },
    ])
    expect(where().value).toBe('')
  })

  it('should clear a condition typed and not applied without reading the table', () => {
    render(element({ canRefresh: true }))

    fireEvent.change(where(), { target: { value: 'id >' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear the WHERE condition' }))

    expect(sent('filterTable')).toStrictEqual([])
    expect(clearWhere()).toBeNull()
  })

  it('should wait while the rows are read', () => {
    render(element({ canRefresh: true, tableFilter: 'id > 1', status: 'running', summary: null }))

    expect(where().disabled).toBe(true)
    const clear = screen.getByRole('button', { name: 'Clear the WHERE condition' })
    expect(isOff(clear)).toBe(true)
    expect(clear.title).toBe('Clear the WHERE condition: the query is still running')
  })
})
