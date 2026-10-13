import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { resultTab } from '../../test/fixtures/results.ts'
import { isOff } from '../../test/webview/grid.ts'
import {
  box,
  JOIN,
  ON_QUERY,
  openPanel,
  openTable,
  ORDERS_SQL,
  QUERY,
  show,
  status,
  TABLE,
  toggleWithKeys,
  typeInBox,
  where,
} from '../../test/webview/query-box.ts'
import { fromHost } from '../../test/webview/vscode-api.ts'
import { BoxQueryProblem } from '../core/results/query-box.ts'

describe('the query box of a table panel', () => {
  it('should take the place of the WHERE with the whole query, from the expand button', () => {
    openTable()
    expect(screen.queryByRole('textbox', { name: 'Query' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Edit the Query (Ctrl+Shift+E)' }))

    expect(box().value).toBe(ORDERS_SQL)
    expect(document.activeElement).toBe(box())
    expect(where()).toBeNull()
    expect(status()).toBe('Cost: 13 ms · 4 rows')
  })

  it('should open and close with Ctrl+Shift+E (Cmd+Shift+E), the text kept', () => {
    const panel = openTable()

    toggleWithKeys()
    expect(box().value).toBe(ORDERS_SQL)
    fireEvent.keyDown(window, { key: 'E', code: 'KeyE', metaKey: true, shiftKey: true })

    expect(screen.queryByRole('textbox', { name: 'Query' })).toBeNull()
    expect(where()).not.toBeNull()
    expect(panel.sent('goToStep')).toStrictEqual([])
  })

  it('should not open outside a table panel', () => {
    openPanel()
    show(resultTab({ id: 'editor-1' }), [])

    toggleWithKeys()

    expect(screen.queryByRole('textbox', { name: 'Query' })).toBeNull()
  })

  it('should color the query as it is typed', () => {
    openTable()
    toggleWithKeys()

    typeInBox("SELECT id FROM orders WHERE code = 'A'")

    const spans = [...document.querySelectorAll('.query-highlight code span')]
    expect(spans.slice(0, 3).map((span) => `${span.className}:${span.textContent}`)).toStrictEqual([
      'sql-keyword:SELECT',
      'sql-plain: ',
      'sql-identifier:id',
    ])
  })
})

describe('running the query box', () => {
  it('should run the query with Ctrl+Enter, Cmd+Enter or Run', () => {
    const panel = openTable()
    toggleWithKeys()
    typeInBox(JOIN)

    fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(box(), { key: 'Enter', metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    expect(panel.sent('runQuery')).toStrictEqual([
      { type: 'runQuery', sql: JOIN },
      { type: 'runQuery', sql: JOIN },
      { type: 'runQuery', sql: JOIN },
    ])
    expect(box().value).toBe(JOIN)
  })

  it('should run only the text selected in it', () => {
    const panel = openTable()
    toggleWithKeys()
    typeInBox('SELECT 1;\nSELECT 2')
    box().setSelectionRange(10, 18)

    fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true })

    expect(panel.sent('runQuery')).toStrictEqual([{ type: 'runQuery', sql: 'SELECT 2' }])
  })

  it('should refuse more than one statement at once, and say why until the text changes', () => {
    const panel = openTable()
    toggleWithKeys()
    typeInBox('SELECT 1; SELECT 2')

    fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true })

    expect(panel.sent('runQuery')).toStrictEqual([])
    expect(status()).toBe(BoxQueryProblem.Statements)
    expect(
      screen.getByRole('region', { name: 'Query' }).querySelector('.is-problem'),
    ).not.toBeNull()

    typeInBox('SELECT 1')
    expect(status()).toBe('Cost: 13 ms · 4 rows')
  })

  it('should say that it runs, and cancel, while the result is on its way', () => {
    const panel = openTable()
    toggleWithKeys()
    fromHost({ type: 'tabs', tabs: [], activeTabId: null })
    fromHost({ type: 'tab', tab: { ...QUERY, status: 'running', summary: null } })

    expect(status()).toBe('Running…')
    fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(panel.sent('runQuery')).toStrictEqual([])
    expect(panel.sent('cancel')).toStrictEqual([{ type: 'cancel' }])
  })

  it('should show the result below, what it cost, and why a run failed', () => {
    openTable()
    toggleWithKeys()

    show(QUERY, ON_QUERY)
    expect(status()).toBe('Cost: 13 ms · 4 rows')
    expect(box().value).toBe(JOIN)

    show({ ...QUERY, id: 'query-3', summary: null }, ON_QUERY)
    expect(status()).toBe('')

    show(
      {
        ...QUERY,
        id: 'query-2',
        status: 'failed',
        error: { message: 'no such table', line: null, column: null },
      },
      ON_QUERY,
    )
    expect(status()).toBe('no such table')
  })
})

describe('leaving the query box', () => {
  it('should show the result of a query in the box, and go back to the rows it was run from', () => {
    const panel = openTable()
    show(QUERY, ON_QUERY)
    expect(box().value).toBe(JOIN)

    fireEvent.click(screen.getByRole('button', { name: 'Close the Query' }))

    expect(panel.sent('goToStep')).toStrictEqual([{ type: 'goToStep', step: 0 }])
    expect(screen.queryByRole('textbox', { name: 'Query' })).toBeNull()
    show(TABLE)
    expect(where()).not.toBeNull()
  })

  it('should give back what the user wrote when it opens again, until it is reverted', () => {
    openTable()
    toggleWithKeys()
    typeInBox('SELECT id FROM orders')
    toggleWithKeys()

    toggleWithKeys()
    expect(box().value).toBe('SELECT id FROM orders')

    fireEvent.click(screen.getByRole('button', { name: 'Revert the Query' }))
    expect(box().value).toBe(ORDERS_SQL)
    expect(isOff(screen.getByRole('button', { name: 'Revert the Query' }))).toBe(true)
  })

  it('should open what it holds in a new SQL editor', () => {
    const panel = openTable()
    toggleWithKeys()
    typeInBox(JOIN)

    fireEvent.click(screen.getByRole('button', { name: 'Open in SQL Editor' }))

    expect(panel.sent('openSqlInEditor')).toStrictEqual([{ type: 'openSqlInEditor', sql: JOIN }])
  })

  it('should open the query of a result in an editor from the other actions of the toolbar', () => {
    const panel = openTable()
    fireEvent.click(screen.getByRole('button', { name: 'More Actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in SQL Editor' }))
    show(QUERY, ON_QUERY)

    fireEvent.click(screen.getByRole('button', { name: 'More Actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in SQL Editor' }))

    expect(panel.sent('openInEditor')).toStrictEqual([{ type: 'openInEditor', tabId: 'rows-1' }])
    expect(panel.sent('openSqlInEditor')).toStrictEqual([{ type: 'openSqlInEditor', sql: JOIN }])
  })
})
