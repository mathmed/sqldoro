import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import { cellAt, GRID_ROWS, theGrid } from '../../test/webview/grid.ts'
import { type FakeVsCodeApi, fakeVsCodeApi, fromHost } from '../../test/webview/vscode-api.ts'
import type { ResultTab, WebviewMessage } from '../core/results/protocol.ts'
import { App } from './App.tsx'
import { ROW_HEIGHT } from './grid-model.ts'

const ORDERS = resultTab({
  id: 'tab-1',
  title: 'SELECT * FROM orders',
  rowCount: 4,
  loadedRows: 4,
})
const CUSTOMERS = resultTab({
  id: 'customers',
  title: 'SELECT * FROM customers',
  status: 'running',
  progress: 'connecting',
  columns: [],
  rowCount: 0,
  loadedRows: 0,
  summary: null,
})
const ZOE = [{ cells: ['7', 'zoe'], truncated: [] }]

let api: FakeVsCodeApi

function rowsOf(tabId: string, viewVersion: number, rows = GRID_ROWS): void {
  fromHost({ type: 'rows', tabId, viewVersion, start: 0, rows })
}

function tab(changes: Partial<ResultTab>): void {
  fromHost({ type: 'tab', tab: { ...ORDERS, ...changes } })
}

function fetches(tabId: string): WebviewMessage[] {
  return api.posted().filter((message) => message.type === 'fetchRows' && message.tabId === tabId)
}

// A panel that shows the rows of ORDERS.
function shownOrders(): void {
  render(<App api={api} />)
  fromHost({ type: 'tabs', tabs: [ORDERS], activeTabId: 'tab-1' })
  rowsOf('tab-1', 0)
}

beforeEach(() => {
  api = fakeVsCodeApi()
})

describe('App, while the rows of a tab are read again', () => {
  it('should keep the rows and the grid of before until the new ones come, then show them', () => {
    shownOrders()
    const grid = theGrid()

    tab({ status: 'running', progress: 'running', viewVersion: 1, rowCount: 0, summary: null })
    expect(screen.getAllByRole('row')).toHaveLength(5)
    expect(cellAt(0, 1).textContent).toBe('ann')
    expect(screen.getByRole('status').textContent).toBe('4 rows in 13 ms')
    tab({ viewVersion: 1, rowCount: 1, loadedRows: 1 })
    expect(cellAt(0, 1).textContent).toBe('ann')
    expect(fetches('tab-1').at(-1)).toMatchObject({ viewVersion: 1, start: 0 })
    rowsOf('tab-1', 1, ZOE)

    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(cellAt(0, 1).textContent).toBe('zoe')
    expect(theGrid()).toBe(grid)
  })

  it('should keep the rows of before while the new ones still stream in', () => {
    shownOrders()

    tab({ status: 'running', progress: 'fetching', viewVersion: 1, rowCount: 1, summary: null })
    rowsOf('tab-1', 1, ZOE)
    expect(cellAt(0, 1).textContent).toBe('ann')
    tab({ viewVersion: 1, rowCount: 1, loadedRows: 1 })

    expect(cellAt(0, 1).textContent).toBe('zoe')
  })

  it('should ask for the rows of a new view with fewer rows than where the grid was, and show them', () => {
    render(<App api={api} />)
    fromHost({ type: 'tabs', tabs: [{ ...ORDERS, rowCount: 1000 }], activeTabId: 'tab-1' })
    rowsOf('tab-1', 0)
    fireEvent.scroll(theGrid(), { target: { scrollTop: ROW_HEIGHT * 450 } })

    tab({ viewVersion: 1, rowCount: 1, loadedRows: 1 })
    expect(fetches('tab-1').at(-1)).toStrictEqual({
      type: 'fetchRows',
      tabId: 'tab-1',
      viewVersion: 1,
      start: 0,
      count: 200,
    })
    rowsOf('tab-1', 1, ZOE)

    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(cellAt(0, 1).textContent).toBe('zoe')
  })

  it('should show a read again that ends without rows at once', () => {
    shownOrders()

    tab({ viewVersion: 1, rowCount: 0, loadedRows: 0 })

    expect(screen.getAllByRole('row')).toHaveLength(1)
  })
})

describe('App, while a new run replaces the tabs', () => {
  it('should keep the result of before until the first rows of the new one come', () => {
    shownOrders()

    fromHost({ type: 'tabs', tabs: [], activeTabId: null })
    expect(cellAt(0, 1).textContent).toBe('ann')
    fromHost({ type: 'tab', tab: CUSTOMERS })
    expect(screen.getByRole('region', { name: 'Result of SELECT * FROM orders' })).toBeDefined()
    fromHost({ type: 'tab', tab: { ...CUSTOMERS, ...ORDERS, id: 'customers', rowCount: 1 } })
    expect(fetches('customers')).toStrictEqual([
      { type: 'fetchRows', tabId: 'customers', viewVersion: 0, start: 0, count: 200 },
    ])
    rowsOf('customers', 0, ZOE)

    expect(screen.getByRole('region', { name: 'Result of SELECT * FROM orders' })).toBeDefined()
    expect(document.getElementById('cell-customers-0-1')?.textContent).toBe('zoe')
  })

  it('should show a new run that failed at once', () => {
    shownOrders()

    fromHost({ type: 'tabs', tabs: [], activeTabId: null })
    fromHost({
      type: 'tab',
      tab: {
        ...CUSTOMERS,
        title: 'SELECT * FROM nowhere',
        status: 'failed',
        error: { message: 'relation "nowhere" does not exist', line: null, column: null },
      },
    })

    expect(screen.getByRole('status').textContent).toBe('relation "nowhere" does not exist')
  })

  it('should ask for the rows of a step of the trail from where its grid was scrolled', () => {
    const steps = [
      { id: 1, label: 'orders', isCurrent: true, isQuery: false },
      { id: 2, label: 'customers', isCurrent: false, isQuery: false },
    ]
    render(<App api={api} />)
    fromHost({ type: 'trail', crumbs: steps })
    fromHost({ type: 'tabs', tabs: [ORDERS], activeTabId: 'tab-1' })
    rowsOf('tab-1', 0)
    fireEvent.scroll(theGrid(), { target: { scrollTop: ROW_HEIGHT * 450 } })
    fromHost({
      type: 'trail',
      crumbs: steps.map((step) => ({ ...step, isCurrent: step.id === 2 })),
    })
    fromHost({ type: 'tabs', tabs: [], activeTabId: null })
    fromHost({ type: 'tab', tab: { ...CUSTOMERS, id: 'step-2', status: 'succeeded', rowCount: 9 } })
    fromHost({ type: 'trail', crumbs: steps })
    fromHost({ type: 'tabs', tabs: [], activeTabId: null })

    fromHost({ type: 'tab', tab: { ...ORDERS, id: 'orders-again', rowCount: 1000 } })

    expect(fetches('step-2')).toMatchObject([{ start: 0 }])
    expect(fetches('orders-again')).toStrictEqual([
      { type: 'fetchRows', tabId: 'orders-again', viewVersion: 0, start: 200, count: 200 },
      { type: 'fetchRows', tabId: 'orders-again', viewVersion: 0, start: 400, count: 200 },
    ])
  })
})
