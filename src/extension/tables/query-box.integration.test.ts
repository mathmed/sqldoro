// The query box of a table panel on real servers: a query typed there runs through the guards in
// place of the rows (a JOIN too), its result is edited when it is provably one table's, the trail
// goes back to the rows, and a read-only connection refuses a write before the server sees it.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  cell,
  closeGrid,
  edit,
  type EditorTarget,
  type GridEditor,
  openTableGrid,
  previewAndApply,
  tabRows,
} from '../../../test/integration/editor.ts'
import { query } from '../../../test/integration/edits.ts'
import {
  connectRequest,
  MYSQL,
  POSTGRES,
  waitUntilReady,
} from '../../../test/integration/servers.ts'
import { postedTabs } from '../../../test/support/query.ts'
import { resetVscode, webviewPanels, window } from '../../../test/vscode.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import type { ObjectRef } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { createEngineRegistry } from '../factories/engines.ts'

interface Case extends EditorTarget {
  readonly name: string
  readonly orders: ObjectRef
  // The names of the tables as a query of the box writes them.
  readonly ordersName: string
  readonly linesName: string
  readonly setup: readonly string[]
}

const CASES: readonly Case[] = [
  {
    name: 'PostgreSQL',
    engineId: 'postgres',
    server: POSTGRES,
    schema: '',
    sql: '',
    orders: { database: 'sqldoro', schema: 'it_box', name: 'orders' },
    ordersName: 'it_box.orders',
    linesName: 'it_box.lines',
    setup: [
      'DROP SCHEMA IF EXISTS it_box CASCADE',
      'CREATE SCHEMA it_box',
      'CREATE TABLE it_box.orders (id int PRIMARY KEY, note text)',
      'CREATE TABLE it_box.lines (id int PRIMARY KEY, order_id int REFERENCES it_box.orders (id), qty int)',
    ],
  },
  {
    name: 'MySQL',
    engineId: 'mysql',
    server: MYSQL,
    schema: '',
    sql: '',
    orders: { database: 'sqldoro', schema: 'sqldoro', name: 'it_box_orders' },
    ordersName: 'it_box_orders',
    linesName: 'it_box_lines',
    setup: [
      'DROP TABLE IF EXISTS it_box_lines',
      'DROP TABLE IF EXISTS it_box_orders',
      'CREATE TABLE it_box_orders (id int PRIMARY KEY, note text) ENGINE=InnoDB',
      'CREATE TABLE it_box_lines (id int PRIMARY KEY, order_id int, qty int, FOREIGN KEY (order_id) REFERENCES it_box_orders (id)) ENGINE=InnoDB',
    ],
  },
]

// The tab of the result of the last query run from the box, once it ran.
function queryTab(grid: GridEditor): Record<string, unknown> | undefined {
  return [...postedTabs(grid.panel).values()].findLast(
    (tab) => (tab['queryBox'] as { isCustom?: boolean } | null)?.isCustom === true,
  )
}

describe.each(CASES)('the query box of a table panel on a real $name server', (target) => {
  let observer: EngineSession
  let grid: GridEditor | undefined

  async function runFromBox(editor: GridEditor, sql: string): Promise<Record<string, unknown>> {
    const before = queryTab(editor)?.['id']
    editor.panel.webview.send({ type: 'runQuery', sql })
    await expect
      .poll(() => {
        const tab = queryTab(editor)
        return tab?.['id'] !== before && tab?.['status'] !== 'running'
      })
      .toBe(true)
    const tab = queryTab(editor) ?? {}
    await expect
      .poll(() => (queryTab(editor)?.['editing'] as { state: string }).state)
      .toMatch(/^(editable|readOnly)$/)
    return tab
  }

  beforeAll(async () => {
    const engine = createEngineRegistry().get(target.engineId)
    await waitUntilReady(async () => {
      observer = await engine.connect(connectRequest(target.server))
    })
    for (const statement of target.setup) {
      await query(observer, statement)
    }
  })

  beforeEach(async () => {
    resetVscode()
    webviewPanels.length = 0
    window.showWarningMessage.mockReset()
    window.showErrorMessage.mockReset()
    window.showErrorMessage.mockResolvedValue(undefined)
    await query(observer, `DELETE FROM ${target.linesName}`)
    await query(observer, `DELETE FROM ${target.ordersName}`)
    await query(observer, `INSERT INTO ${target.ordersName} VALUES (1, 'first'), (2, 'second')`)
    await query(
      observer,
      `INSERT INTO ${target.linesName} VALUES (10, 1, 3), (11, 1, 4), (12, 2, 5)`,
    )
  })

  afterEach(async () => {
    if (grid !== undefined) {
      await closeGrid(grid)
    }
    grid = undefined
  })

  afterAll(async () => {
    await observer.close()
  })

  function joinOf(): string {
    return `SELECT o.id, o.note, l.qty FROM ${target.ordersName} o JOIN ${target.linesName} l ON l.order_id = o.id ORDER BY l.id`
  }

  it('should run a JOIN in place of the rows, read-only, and keep it in the history', async () => {
    const opened = await openTableGrid(target, target.orders)
    grid = opened

    const tab = await runFromBox(opened, joinOf())

    expect(tab).toMatchObject({ sql: joinOf(), status: 'succeeded', queryBox: { isCustom: true } })
    expect(tab['editing']).toMatchObject({ state: 'readOnly' })
    expect(tabRows({ ...opened, tabId: String(tab['id']) }).map(String)).toStrictEqual([
      '1,first,3',
      '1,first,4',
      '2,second,5',
    ])
    expect(opened.query.history.list().map((entry) => entry.sql)).toStrictEqual([joinOf()])
  })

  it('should go back from the result of a query to the rows it was run from', async () => {
    const opened = await openTableGrid(target, target.orders)
    grid = opened
    await runFromBox(opened, joinOf())
    const steps = opened.query.tables.navigations.get(opened.uri)?.steps ?? []
    expect(steps.map((step) => step.query)).toStrictEqual(['', joinOf()])

    opened.panel.webview.send({ type: 'goToStep', step: steps.at(0)?.id })

    await expect
      .poll(() => [...postedTabs(opened.panel).values()].at(-1)?.['status'])
      .toBe('succeeded')
    expect(opened.query.tables.navigations.current(opened.uri)?.query).toBe('')
  })

  it('should keep the result of a query of one table editable, and apply its changes', async () => {
    grid = await openTableGrid(target, target.orders)

    const tab = await runFromBox(grid, `SELECT id, note FROM ${target.ordersName} WHERE id = 2`)
    expect(tab['editing']).toMatchObject({ state: 'editable' })
    const result = { ...grid, tabId: String(tab['id']) }
    expect(tabRows(result)).toStrictEqual([[2, 'second']])

    edit(result, { kind: EditKind.Set, block: cell(0, 1), input: 'edited in the box' })
    await previewAndApply(result)

    const stored = await query(observer, `SELECT note FROM ${target.ordersName} WHERE id = 2`)
    expect(stored.rows).toStrictEqual([['edited in the box']])
  })

  it('should refuse a write on a read-only connection before the server sees it', async () => {
    grid = await openTableGrid(target, target.orders, { isReadOnly: true })

    grid.panel.webview.send({
      type: 'runQuery',
      sql: `UPDATE ${target.ordersName} SET note = 'nope' WHERE id = 1`,
    })

    await expect.poll(() => window.showErrorMessage.mock.calls.length).toBe(1)
    expect(String(window.showErrorMessage.mock.calls[0]?.[0])).toContain('is read-only')
    expect(queryTab(grid)).toBeUndefined()
    expect(grid.query.tables.navigations.get(grid.uri)?.steps).toHaveLength(1)
    const stored = await query(observer, `SELECT note FROM ${target.ordersName} WHERE id = 1`)
    expect(stored.rows).toStrictEqual([['first']])
  })

  it('should refuse more than one statement at once', async () => {
    grid = await openTableGrid(target, target.orders)

    grid.panel.webview.send({
      type: 'runQuery',
      sql: `SELECT 1; DELETE FROM ${target.linesName}`,
    })

    await expect.poll(() => window.showWarningMessage.mock.calls.length).toBe(1)
    const count = await query(observer, `SELECT count(*) FROM ${target.linesName}`)
    expect(String(count.rows[0]?.[0])).toBe('3')
  })
})
