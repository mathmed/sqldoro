// The rows of a table opened from the explorer, on real servers: the query sqldoro writes for it,
// its WHERE, the editing of its rows through the grid, and the views that stay read-only.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  cell,
  closeGrid,
  edit,
  editingOf,
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
import { resetVscode, settings, webviewPanels, window } from '../../../test/vscode.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import type { ObjectRef } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { createEngineRegistry } from '../factories/engines.ts'

interface Case extends EditorTarget {
  readonly name: string
  readonly orders: ObjectRef
  readonly openOrders: ObjectRef
  readonly title: string
  readonly read: string
  readonly label: string
  readonly setup: readonly string[]
}

const CASES: readonly Case[] = [
  {
    name: 'PostgreSQL',
    engineId: 'postgres',
    server: POSTGRES,
    schema: '',
    sql: '',
    orders: { database: 'sqldoro', schema: 'it_table', name: 'orders' },
    openOrders: { database: 'sqldoro', schema: 'it_table', name: 'open_orders' },
    title: 'Integration/sqldoro/it_table.orders',
    read: 'SELECT * FROM "it_table"."orders"',
    label: 'it_table.orders',
    setup: [
      'DROP SCHEMA IF EXISTS it_table CASCADE',
      'CREATE SCHEMA it_table',
      'CREATE TABLE it_table.orders (id int PRIMARY KEY, note text)',
      'CREATE VIEW it_table.open_orders AS SELECT id, note FROM it_table.orders',
    ],
  },
  {
    name: 'MySQL',
    engineId: 'mysql',
    server: MYSQL,
    schema: '',
    sql: '',
    orders: { database: 'sqldoro', schema: 'sqldoro', name: 'it_table_orders' },
    openOrders: { database: 'sqldoro', schema: 'sqldoro', name: 'it_table_open_orders' },
    title: 'Integration/sqldoro/it_table_orders',
    read: 'SELECT * FROM `sqldoro`.`it_table_orders`',
    label: 'sqldoro.it_table_orders',
    setup: [
      'DROP VIEW IF EXISTS it_table_open_orders',
      'DROP TABLE IF EXISTS it_table_orders',
      'CREATE TABLE it_table_orders (id int PRIMARY KEY, note text) ENGINE=InnoDB',
      'CREATE VIEW it_table_open_orders AS SELECT id, note FROM it_table_orders',
    ],
  },
]

describe.each(CASES)('the rows of a table on a real $name server', (target) => {
  let observer: EngineSession
  let grid: GridEditor | undefined

  function table(): string {
    return `${target.orders.schema}.${target.orders.name}`
  }

  // What the WHERE input of the result view sends, and the read it starts, once over and checked.
  async function filter(editor: GridEditor, condition: string): Promise<void> {
    const version = postedTabs(editor.panel).get(editor.tabId)?.['viewVersion']
    editor.panel.webview.send({ type: 'filterTable', tabId: editor.tabId, condition })
    await expect
      .poll(() => {
        const tab = postedTabs(editor.panel).get(editor.tabId)
        return tab?.['viewVersion'] !== version && tab?.['status'] === 'succeeded'
      })
      .toBe(true)
    await expect.poll(() => editingOf(editor).state).toMatch(/^(editable|readOnly)$/)
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
    settings.set('sqldoro.transactions.defaultMode', 'manual')
    await query(observer, `DELETE FROM ${table()}`)
    await query(observer, `INSERT INTO ${table()} VALUES (1, 'first'), (2, NULL)`)
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

  it('should read every row of the table and apply its changes, whatever the default mode', async () => {
    grid = await openTableGrid(target, target.orders)
    expect(grid.panel.title).toBe(target.title)
    expect(postedTabs(grid.panel).get(grid.tabId)).toMatchObject({ sql: target.read })
    expect(tabRows(grid)).toStrictEqual([
      [1, 'first'],
      [2, null],
    ])

    edit(grid, { kind: EditKind.Set, block: cell(1, 1), input: 'second' })
    const editing = await previewAndApply(grid)

    expect(editing).toMatchObject({ notice: `Applied 1 update on ${target.label}.` })
    const result = await query(observer, `SELECT id, note FROM ${table()} ORDER BY id`)
    expect(result.rows).toStrictEqual([
      [1, 'first'],
      [2, 'second'],
    ])
  })

  it('should read the rows that meet a WHERE, keep them editable, and read every row once it is cleared', async () => {
    grid = await openTableGrid(target, target.orders)

    await filter(grid, 'id > 1 -- the later ones')

    expect(postedTabs(grid.panel).get(grid.tabId)).toMatchObject({
      sql: `${target.read} WHERE (id > 1 -- the later ones\n)`,
      tableFilter: 'id > 1 -- the later ones',
    })
    expect(tabRows(grid)).toStrictEqual([[2, null]])
    edit(grid, { kind: EditKind.Set, block: cell(0, 1), input: 'filtered' })
    await previewAndApply(grid)
    expect(tabRows(grid)).toStrictEqual([[2, 'filtered']])

    await filter(grid, '')
    expect(tabRows(grid)).toStrictEqual([
      [1, 'first'],
      [2, 'filtered'],
    ])
  })

  it('should refuse a WHERE that would end the statement, before the server sees it', async () => {
    grid = await openTableGrid(target, target.orders)

    grid.panel.webview.send({
      type: 'filterTable',
      tabId: grid.tabId,
      condition: `id > 0; DELETE FROM ${table()}`,
    })

    await expect.poll(() => window.showWarningMessage.mock.calls.length).toBe(1)
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'The condition cannot end the statement or start another: remove its semicolon (;).',
    )
    const result = await query(observer, `SELECT count(*) AS total FROM ${table()}`)
    expect(String(result.rows[0]?.[0])).toBe('2')
  })

  it('should keep the rows of a view read-only', async () => {
    grid = await openTableGrid(target, target.openOrders)

    expect(postedTabs(grid.panel).get(grid.tabId)).toMatchObject({
      status: 'succeeded',
      editing: { state: 'readOnly' },
    })
  })
})
