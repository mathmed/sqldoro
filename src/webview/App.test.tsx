import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import { cellAt, GRID_ROWS, LONG_TEXT } from '../../test/webview/grid.ts'
import { type FakeVsCodeApi, fakeVsCodeApi, fromHost } from '../../test/webview/vscode-api.ts'
import { App } from './App.tsx'

const FIRST = resultTab({ id: 'tab-1', title: 'SELECT * FROM orders', rowCount: 4 })
const SECOND = resultTab({ id: 'tab-2', title: 'SELECT 2', rowCount: 1 })

let api: FakeVsCodeApi

function rowsOf(tabId: string): void {
  fromHost({ type: 'rows', tabId, viewVersion: 0, start: 0, rows: GRID_ROWS })
}

beforeEach(() => {
  api = fakeVsCodeApi()
})

describe('App', () => {
  it('should tell the host it is ready, and wait for a run', () => {
    render(<App api={api} />)

    expect(api.posted()).toStrictEqual([{ type: 'ready' }])
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
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('1. SELECT id FROM orders')
    fromHost({ type: 'tab', tab: SECOND })

    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('2. SELECT 2')
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

  it('should forget the rows of the tabs of a run that is gone', () => {
    render(<App api={api} />)
    fromHost({ type: 'tabs', tabs: [FIRST], activeTabId: 'tab-1' })
    rowsOf('tab-1')

    fromHost({ type: 'tabs', tabs: [SECOND], activeTabId: 'tab-2' })
    fromHost({ type: 'tabs', tabs: [FIRST], activeTabId: 'tab-1' })

    expect(cellAt(0, 1).className).toContain('look-loading')
  })

  it('should report a message it cannot read', () => {
    render(<App api={api} />)

    fromHost({ type: 'tabs' })

    expect(api.posted().at(-1)).toMatchObject({ type: 'problem' })
  })
})
