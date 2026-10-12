// A table panel of the result view, as App shows it, for the tests of its query box: the rows of
// the orders, the result of a query run from the box, and the parts of the box.
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'

import { BOX_LINE_HEIGHT, BOX_PADDING } from '../../src/core/grid/query-mode.ts'
import type { Crumb } from '../../src/core/navigation/history.ts'
import type { ResultTab } from '../../src/core/results/protocol.ts'
import { App } from '../../src/webview/App.tsx'
import { resultTab } from '../fixtures/results.ts'
import { GRID_ROWS } from './grid.ts'
import { type FakeVsCodeApi, fakeVsCodeApi, fromHost } from './vscode-api.ts'

export const ORDERS_SQL = 'SELECT * FROM "sales"."orders" LIMIT 100'
export const JOIN = 'SELECT o.id\nFROM orders o\nJOIN lines l ON l.order_id = o.id'
export const TABLE = resultTab({
  id: 'rows-1',
  canRefresh: true,
  rowCount: 4,
  loadedRows: 4,
  queryBox: { sql: ORDERS_SQL, isCustom: false },
})
export const QUERY = resultTab({
  id: 'query-1',
  sql: JOIN,
  rowCount: 4,
  loadedRows: 4,
  summary: { durationMs: 13, affectedRows: null, isTruncated: false, autoLimit: null },
  queryBox: { sql: JOIN, isCustom: true },
})
const ON_TABLE: readonly Crumb[] = [{ id: 0, label: 'orders', isCurrent: true, isQuery: false }]
export const ON_QUERY: readonly Crumb[] = [
  { id: 0, label: 'orders', isCurrent: false, isQuery: false },
  { id: 1, label: 'Query', isCurrent: true, isQuery: true },
]

export interface QueryPanel {
  readonly api: FakeVsCodeApi
  // The messages of a type the view posted, in order.
  readonly sent: (type: string) => unknown[]
}

// The view, before the host told it anything.
export function openPanel(): QueryPanel {
  const api = fakeVsCodeApi()
  render(createElement(App, { api }))
  return { api, sent: (type) => api.posted().filter((message) => message.type === type) }
}

// The rows of the orders in a table panel, the tables of their schema offered to the box.
export function openTable(): QueryPanel {
  const panel = openPanel()
  fromHost({ type: 'queryBox', tables: ['orders', 'order_lines'], height: null })
  show(TABLE)
  return panel
}

// A new result from the host, in its step of the trail, with its rows.
export function show(tab: ResultTab, crumbs: readonly Crumb[] = ON_TABLE): void {
  fromHost({ type: 'trail', crumbs })
  fromHost({ type: 'tabs', tabs: [tab], activeTabId: tab.id })
  fromHost({ type: 'rows', tabId: tab.id, viewVersion: 0, start: 0, rows: GRID_ROWS })
}

export function box(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'Query' })
}

export function where(): HTMLElement | null {
  return screen.queryByRole('combobox', { name: 'WHERE condition' })
}

export function typeInBox(text: string, cursor = text.length): void {
  fireEvent.change(box(), { target: { value: text, selectionStart: cursor } })
}

export function toggleWithKeys(): void {
  fireEvent.keyDown(window, { key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: true })
}

// An element the box must have.
export function part(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector)
  if (element === null) {
    throw new Error(`the query box has no ${selector}`)
  }
  return element
}

export function status(): string | null {
  return part('.query-status').textContent
}

export function heightOf(): string {
  return part('.query-field').style.height
}

// The height of this many lines of text in the box.
export function lines(count: number): string {
  return `${String(count * BOX_LINE_HEIGHT + BOX_PADDING)}px`
}
