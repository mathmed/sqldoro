import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakePanelActions } from '../../../test/fakes/panel-actions.ts'
import {
  lastPanel,
  type NavigationHarness,
  navigationHarness,
  postedOf,
} from '../../../test/support/navigation.ts'
import { SHOP } from '../../../test/support/query.ts'
import { ORDERS_REF, tabOf } from '../../../test/support/tables.ts'
import { documents, resetVscode, webviewPanels, window } from '../../../test/vscode.ts'
import { crumbsOf, currentStep } from '../../core/navigation/history.ts'
import { BoxQueryProblem } from '../../core/results/query-box.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { QueryBoxHeight } from './query-box-height.ts'
import { tableActions } from './table-actions.ts'

const JOIN = 'SELECT o.id, l.qty FROM sales.orders o JOIN sales.lines l ON l.order_id = o.id'
const UPDATE = "UPDATE sales.orders SET code = 'B-1' WHERE id = 1"

let nav: NavigationHarness

beforeEach(async () => {
  resetVscode()
  webviewPanels.length = 0
  documents.length = 0
  window.showWarningMessage.mockReset()
  window.showErrorMessage.mockReset()
  window.showErrorMessage.mockResolvedValue(undefined)
  nav = await navigationHarness()
})

afterEach(() => {
  nav.harness.dispose()
})

function shown(): ResultSet {
  return tabOf(nav.harness, nav.orders.uri)
}

function labels(): string[] {
  const navigation = nav.harness.tables.navigations.get(nav.orders.uri)
  return navigation === undefined ? [] : crumbsOf(navigation).map(({ label }) => label)
}

function crumbIds(): number[] {
  return nav.harness.tables.navigations.get(nav.orders.uri)?.steps.map(({ id }) => id) ?? []
}

async function runFromBox(sql: string, count: number): Promise<void> {
  nav.orders.panel.webview.send({ type: 'runQuery', sql })
  await nav.settled(count)
}

describe('running the query box of a table panel', () => {
  it('should run the query in place of the rows, as a step of the trail, kept in the history', async () => {
    await runFromBox(`${JOIN};`, 2)

    expect(nav.sent().at(-1)).toMatchObject({ sql: JOIN, values: [] })
    expect(shown().toTab()).toMatchObject({
      sql: JOIN,
      canRefresh: false,
      canServerView: true,
      queryBox: { sql: JOIN, isCustom: true },
      status: 'succeeded',
    })
    expect(labels()).toStrictEqual(['orders', 'Query'])
    expect(nav.harness.records.map(({ sql }) => sql)).toStrictEqual([JOIN])
    expect(postedOf(nav.orders.panel, 'trail').at(-1)).toMatchObject({
      crumbs: [{ label: 'orders' }, { label: 'Query', isCurrent: true, isQuery: true }],
    })
  })

  it('should refuse more than one statement, and a box with nothing to run', async () => {
    const before = nav.sent().length

    nav.orders.panel.webview.send({ type: 'runQuery', sql: 'SELECT 1; SELECT 2' })
    await vi.waitFor(() => {
      expect(nav.harness.runner.isRunning(nav.orders.uri)).toBe(false)
      expect(window.showWarningMessage).toHaveBeenCalledOnce()
    })
    nav.orders.panel.webview.send({ type: 'runQuery', sql: '  -- nothing ' })

    await vi.waitFor(() => {
      expect(window.showWarningMessage).toHaveBeenCalledTimes(2)
    })
    expect(window.showWarningMessage.mock.calls.map((call) => String(call[0]))).toStrictEqual([
      BoxQueryProblem.Statements,
      BoxQueryProblem.Empty,
    ])
    expect(nav.sent()).toHaveLength(before)
    expect(labels()).toStrictEqual(['orders'])
  })

  it('should leave the rows and the trail as they were when the guards refuse it', async () => {
    nav.harness.connections.set('shop', { ...SHOP, isReadOnly: true })
    const before = nav.sent().length

    nav.orders.panel.webview.send({ type: 'runQuery', sql: UPDATE })

    await vi.waitFor(() => {
      expect(window.showErrorMessage).toHaveBeenCalledOnce()
    })
    expect(String(window.showErrorMessage.mock.calls[0]?.[0])).toContain(
      '"Shop" is read-only: sqldoro did not run this UPDATE',
    )
    expect(nav.sent()).toHaveLength(before)
    expect(labels()).toStrictEqual(['orders'])
    expect(shown()).toBe(nav.orders.tab)
    expect(nav.harness.records).toStrictEqual([])
  })

  it('should keep changes not applied in the rows unless the user drops them', async () => {
    nav.send({ type: 'edit', edit: { kind: 'insert', block: null, input: '' } })
    await vi.waitFor(() => {
      expect(nav.orders.tab.editor.hasChanges).toBe(true)
    })
    const before = nav.sent().length

    nav.orders.panel.webview.send({ type: 'runQuery', sql: JOIN })

    await vi.waitFor(() => {
      expect(window.showWarningMessage).toHaveBeenCalledOnce()
    })
    expect(nav.sent()).toHaveLength(before)
    expect(labels()).toStrictEqual(['orders'])
  })

  it('should run another query in place of the step of a query, which Back leaves', async () => {
    await runFromBox(JOIN, 2)
    await runFromBox('SELECT 1', 3)

    expect(labels()).toStrictEqual(['orders', 'Query'])
    const navigation = nav.harness.tables.navigations.get(nav.orders.uri)
    expect(navigation === undefined ? '' : currentStep(navigation).query).toBe('SELECT 1')

    nav.orders.panel.webview.send({ type: 'goToStep', step: crumbIds()[0] })
    await nav.settled(4)

    expect(nav.sent().at(-1)?.sql).toBe('SELECT * FROM "sales"."orders"')
    expect(shown().toTab().queryBox?.isCustom).toBe(false)
    expect(nav.harness.records).toHaveLength(2)
  })

  it('should run the query of a step again when it is shown again, if it only reads', async () => {
    await runFromBox(JOIN, 2)
    const [table, query] = crumbIds()
    nav.orders.panel.webview.send({ type: 'goToStep', step: table })
    await nav.settled(3)

    nav.orders.panel.webview.send({ type: 'goToStep', step: query })
    await nav.settled(4)

    expect(nav.sent().at(-1)?.sql).toBe(JOIN)
    expect(shown().toTab().queryBox).toStrictEqual({ sql: JOIN, isCustom: true })
    expect(nav.harness.records).toHaveLength(2)
  })

  it('should not run a query that writes again on its own', async () => {
    await runFromBox(UPDATE, 2)
    expect(shown().toTab().summary?.affectedRows).toBe(1)
    const [table, query] = crumbIds()
    nav.orders.panel.webview.send({ type: 'goToStep', step: table })
    await nav.settled(3)

    nav.orders.panel.webview.send({ type: 'goToStep', step: query })
    await vi.waitFor(() => {
      expect(shown().toTab().status).toBe('failed')
    })

    expect(nav.sent()).toHaveLength(3)
    expect(shown().toTab().error?.message).toContain('did not run this query again')
    expect(shown().toTab().queryBox).toStrictEqual({ sql: UPDATE, isCustom: true })
  })

  it('should refresh the explorer after a query that changes the schema', async () => {
    await runFromBox('CREATE TABLE sales.notes_copy (id INT)', 2)

    expect(nav.harness.schemaChanges).toStrictEqual(['shop'])
  })

  it('should show the error of the server in place of the rows, and refresh nothing', async () => {
    nav.harness.engine.answer = () => ({ error: new Error('relation "nope" does not exist') })

    await runFromBox('DROP TABLE nope', 2)

    expect(shown().toTab()).toMatchObject({
      status: 'failed',
      error: { message: 'relation "nope" does not exist', line: null, column: null },
    })
    expect(nav.harness.schemaChanges).toStrictEqual([])
    expect(nav.harness.records.map(({ outcome }) => outcome)).toStrictEqual(['failed'])
    expect(labels()).toStrictEqual(['orders', 'Query'])
  })
})

describe('the result of a query of the query box', () => {
  beforeEach(async () => {
    await runFromBox(JOIN, 2)
  })

  it('should be sorted here, or on the server around the query, as in an editor', async () => {
    const view = { sort: [{ column: 0, isDescending: true }], filters: [] }
    nav.orders.panel.webview.send({ type: 'setView', tabId: shown().id, view, isServerSide: false })
    await vi.waitFor(() => {
      expect(shown().view).toStrictEqual(view)
    })
    expect(nav.sent()).toHaveLength(2)

    nav.orders.panel.webview.send({ type: 'setView', tabId: shown().id, view, isServerSide: true })
    await nav.settled(3)

    expect(nav.sent().at(-1)?.sql).toBe(
      `SELECT * FROM (\n${JOIN}\n) AS sqldoro_view\nORDER BY "id" DESC`,
    )
  })

  it('should read every row as in an editor, and keep its columns out of the table', async () => {
    nav.orders.panel.webview.send({ type: 'loadAll', tabId: shown().id })
    await nav.settled(3)
    nav.orders.panel.webview.send({
      type: 'setLayout',
      tabId: shown().id,
      layout: { order: [], hidden: ['id'] },
    })
    await vi.waitFor(() => {
      expect(shown().layout.hidden).toStrictEqual(['id'])
    })

    expect(nav.sent().at(-1)?.sql).toBe(JOIN)
    expect(nav.harness.tables.layouts.get('shop', ORDERS_REF).hidden).toStrictEqual([])
  })
})

describe('what the query box of a table panel opens and keeps', () => {
  it('should open its text in a new SQL editor on the connection of the panel', async () => {
    nav.orders.panel.webview.send({ type: 'openSqlInEditor', sql: JOIN })

    await vi.waitFor(() => {
      expect(documents.at(-1)?.getText()).toBe(JOIN)
    })
    expect(nav.harness.bindings.get(documents.at(-1)?.uri as never)).toStrictEqual({
      connectionId: 'shop',
      database: 'shop',
      schema: 'sales',
    })
  })

  it('should keep the height of the box for the table panels of the workspace', async () => {
    nav.orders.panel.webview.send({ type: 'setQueryHeight', height: 240 })
    await vi.waitFor(() => {
      expect(nav.harness.tables.queryHeight.get()).toBe(240)
    })

    nav.send({ type: 'refresh' })
    await nav.settled(2)

    await vi.waitFor(() => {
      expect(postedOf(lastPanel(), 'queryBox').at(-1)).toStrictEqual({
        type: 'queryBox',
        tables: [],
        height: 240,
      })
    })
  })

  it('should log a height it could not keep', async () => {
    const memento = {
      get: () => undefined,
      update: async () => Promise.reject(new Error('disk full')),
    }
    const sut = tableActions(
      { ...nav.harness.tables, queryHeight: new QueryBoxHeight(memento as never) },
      nav.orders.uri,
      fakePanelActions(),
    )

    await sut.setQueryHeight(120)

    expect(nav.harness.log.warn).toHaveBeenCalledWith(
      'Could not keep the height of the query box: disk full',
    )
  })
})
