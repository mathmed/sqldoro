import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import { cellAt, GRID_ROWS, LONG_TEXT } from '../../test/webview/grid.ts'
import { type FakeVsCodeApi, fakeVsCodeApi, fromHost } from '../../test/webview/vscode-api.ts'
import { App } from './App.tsx'

const FIRST = resultTab({ id: 'tab-1', title: 'SELECT * FROM orders', rowCount: 4 })
const SECOND = resultTab({ id: 'tab-2', title: 'SELECT 2', rowCount: 1 })
const SHOP = {
  name: 'Shop',
  environment: 'prod',
  isProduction: false,
  isReadOnly: false,
  color: '',
}
const TRAIL = [
  { id: 1, label: 'Condominium #1', isCurrent: false, isQuery: false },
  { id: 2, label: 'CondominiumBankAccount (condominiumId = 1)', isCurrent: true, isQuery: false },
]

let api: FakeVsCodeApi

function rowsOf(tabId: string, viewVersion = 0): void {
  fromHost({ type: 'rows', tabId, viewVersion, start: 0, rows: GRID_ROWS })
}

// How many times the view asked for the rows of a tab.
function fetchesOf(tabId: string): number {
  return api.posted().filter((message) => message.type === 'fetchRows' && message.tabId === tabId)
    .length
}

beforeEach(() => {
  api = fakeVsCodeApi()
})

describe('App', () => {
  it('should tell the host it is ready, and say nothing until it tells the tabs', () => {
    render(<App api={api} />)
    expect(api.posted()).toStrictEqual([{ type: 'ready' }])
    expect(screen.queryByText('Run a query to see its results here.')).toBeNull()

    fromHost({ type: 'tabs', tabs: [], activeTabId: null })

    expect(screen.getByText('Run a query to see its results here.')).toBeDefined()
  })

  it('should show the tabs of a run, the last one in front, and the rows the host sends', () => {
    render(<App api={api} />)

    fromHost({ type: 'tabs', tabs: [FIRST, SECOND], activeTabId: null })
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('2. SELECT 2')

    fireEvent.click(screen.getByRole('tab', { name: /SELECT \* FROM orders/ }))
    rowsOf('tab-1')

    expect(cellAt(0, 1).textContent).toBe('ann')
  })

  it('should update a tab, and bring a new one to the front', () => {
    render(<App api={api} />)
    fromHost({ type: 'tabs', tabs: [FIRST], activeTabId: 'tab-1' })

    fromHost({ type: 'tab', tab: { ...FIRST, title: 'SELECT id FROM orders' } })
    expect(screen.getByRole('region', { name: 'Result of SELECT id FROM orders' })).toBeDefined()
    fromHost({ type: 'tab', tab: SECOND })

    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('2. SELECT 2')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('tab-tab-2')
  })

  it('should show no tabs for a run of one statement, its statement in the tooltip of its status', () => {
    render(<App api={api} />)

    fromHost({ type: 'tabs', tabs: [FIRST], activeTabId: 'tab-1' })

    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('status').title).toBe('SELECT * FROM orders')
  })

  it('should show the whole value the host sends for a cut cell', () => {
    render(<App api={api} />)
    fromHost({ type: 'tabs', tabs: [FIRST], activeTabId: 'tab-1' })
    rowsOf('tab-1')

    fireEvent.doubleClick(cellAt(3, 1))
    fromHost({ type: 'cell', tabId: 'tab-1', viewVersion: 0, row: 3, column: 1, value: 'whole' })

    expect(screen.getByLabelText('Value of name').textContent).toContain('whole')
    expect(screen.getByLabelText('Value of name').textContent).not.toContain(LONG_TEXT)
  })

  it('should forget the rows of the tabs of a run that is gone once another one shows', () => {
    render(<App api={api} />)
    fromHost({ type: 'tabs', tabs: [FIRST], activeTabId: 'tab-1' })
    rowsOf('tab-1')
    fromHost({ type: 'tabs', tabs: [SECOND], activeTabId: 'tab-2' })
    rowsOf('tab-2')
    expect(fetchesOf('tab-1')).toBe(1)

    fromHost({ type: 'tabs', tabs: [FIRST], activeTabId: 'tab-1' })

    expect(fetchesOf('tab-1')).toBe(2)
  })

  it('should show the connection above the results in its color, production in red', () => {
    render(<App api={api} />)
    expect(screen.queryByRole('note', { name: 'Connection' })).toBeNull()

    fromHost({
      type: 'connection',
      connection: { ...SHOP, isProduction: true, color: 'charts.red' },
    })
    const chip = screen.getByRole('note', { name: 'Connection' })
    expect(chip.textContent).toBe('PROD · Shop')
    expect(chip.className).toBe('connection-chip production')

    fromHost({
      type: 'connection',
      connection: { ...SHOP, environment: '', name: 'Local', color: 'charts.blue' },
    })
    expect(screen.getByRole('note', { name: 'Connection' })).toMatchObject({
      textContent: 'Local',
      className: 'connection-chip',
    })
    expect(screen.queryByRole('button', { name: 'Read-only' })).toBeNull()
  })

  it('should say once that the connection is read-only, and offer to allow writes', () => {
    render(<App api={api} />)
    fromHost({ type: 'connection', connection: { ...SHOP, isReadOnly: true } })

    const lock = screen.getByRole('button', { name: 'Read-only' })
    expect(lock.title).toContain('refuse anything that writes')
    fireEvent.click(lock)
    fireEvent.click(screen.getByRole('button', { name: 'Allow Writes…' }))

    expect(api.posted().at(-1)).toStrictEqual({ type: 'allowWrites' })
    expect(screen.queryByRole('button', { name: 'Allow Writes…' })).toBeNull()
  })

  it('should show the trail of a table panel and go along it', () => {
    render(<App api={api} />)
    fromHost({ type: 'tabs', tabs: [FIRST], activeTabId: 'tab-1' })
    fromHost({ type: 'trail', crumbs: TRAIL })

    const trail = screen.getByRole('navigation', { name: 'Trail' })
    expect(trail.textContent).toContain('Condominium #1')
    expect(screen.getByRole('button', { name: 'Forward' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Condominium #1' }))
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true })

    expect(api.posted().filter((message) => message.type === 'goToStep')).toStrictEqual([
      { type: 'goToStep', step: 1 },
      { type: 'goToStep', step: 1 },
      { type: 'goToStep', step: 1 },
    ])
  })

  it('should leave Alt with the arrows to the fields', () => {
    render(<App api={api} />)
    fromHost({ type: 'tabs', tabs: [{ ...FIRST, canRefresh: true }], activeTabId: 'tab-1' })
    fromHost({ type: 'trail', crumbs: TRAIL })

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'WHERE condition' }), {
      key: 'ArrowLeft',
      altKey: true,
    })
    fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })

    expect(api.posted().filter((message) => message.type === 'goToStep')).toStrictEqual([])
  })

  it('should ask for every row of a tab cut by the automatic limit', () => {
    render(<App api={api} />)
    const limited = {
      ...FIRST,
      rowCount: 1000,
      loadedRows: 1000,
      summary: { durationMs: 3, affectedRows: null, isTruncated: true, autoLimit: 1000 },
    }
    fromHost({ type: 'tabs', tabs: [limited], activeTabId: 'tab-1' })

    expect(screen.getByRole('status').textContent).toBe(
      '1,000 rows (limited to 1,000 rows) in 3 ms',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load All Rows' }))

    expect(api.posted().at(-1)).toStrictEqual({ type: 'loadAll', tabId: 'tab-1' })
  })

  it('should report a message it cannot read', () => {
    render(<App api={api} />)

    fromHost({ type: 'tabs' })

    expect(api.posted().at(-1)).toMatchObject({ type: 'problem' })
  })
})
