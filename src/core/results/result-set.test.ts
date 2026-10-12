import { describe, expect, it } from 'vitest'

import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { RESULT_COLUMNS } from '../../../test/fixtures/results.ts'
import { NOT_EDITING } from '../edits/tab-editor.ts'
import { ResultSet } from './result-set.ts'

const SQL = 'SELECT id, name\nFROM orders'

function resultSet(changes: Partial<ConstructorParameters<typeof ResultSet>[0]> = {}): ResultSet {
  const sut = new ResultSet({
    values: [],
    id: 't1',
    sql: SQL,
    kind: 'rows',
    canServerView: true,
    canRefresh: false,
    ...changes,
  })
  sut.describe(RESULT_COLUMNS)
  sut.addRows([
    ['3', 'c'],
    ['1', null],
  ])
  sut.addRows([['2', 'b'.repeat(10)]])
  return sut
}

describe('ResultSet', () => {
  it('should start as a running tab of the statement', () => {
    const sut = new ResultSet({
      values: [],
      id: 't1',
      sql: SQL,
      kind: 'rows',
      canServerView: true,
      canRefresh: false,
    })

    expect(sut.toTab()).toStrictEqual({
      id: 't1',
      title: 'SELECT id, name FROM orders',
      sql: SQL,
      kind: 'rows',
      status: 'running',
      progress: 'running',
      columns: [],
      meta: [],
      references: [],
      layout: { order: [], hidden: [] },
      rowCount: 0,
      loadedRows: 0,
      view: { sort: [], filters: [] },
      viewVersion: 0,
      isServerView: false,
      canServerView: true,
      canRefresh: false,
      tableFilter: '',
      search: '',
      summary: null,
      error: null,
      notice: '',
      plan: [],
      editing: NOT_EDITING,
      queryBox: null,
    })
    expect(sut.isRunning).toBe(true)
    expect(sut.id).toBe('t1')
    expect(sut.sql).toBe(SQL)
    expect(sut.tableFilter).toBe('')
    expect(sut.searchText).toBe('')
  })

  it('should hold the rows that arrive, in order', () => {
    const sut = resultSet()

    expect(sut.rowCount).toBe(3)
    expect(sut.columns).toBe(RESULT_COLUMNS)
    expect(sut.rows(0, 10)).toStrictEqual([
      ['3', 'c'],
      ['1', null],
      ['2', 'bbbbbbbbbb'],
    ])
    expect(sut.rows(1, 1)).toStrictEqual([['1', null]])
    expect(sut.rows(-5, 1)).toStrictEqual([['3', 'c']])
    expect(sut.rows(2, -1)).toStrictEqual([])
  })

  it('should show the rows through a view, and back without it', () => {
    const sut = resultSet()

    sut.applyView({ sort: [{ column: 0, isDescending: false }], filters: [] })

    expect(sut.rows(0, 10)).toStrictEqual([
      ['1', null],
      ['2', 'bbbbbbbbbb'],
      ['3', 'c'],
    ])
    expect(sut.rows(1, 1)).toStrictEqual([['2', 'bbbbbbbbbb']])
    expect(sut.viewVersion).toBe(1)
    expect(sut.view).toStrictEqual({ sort: [{ column: 0, isDescending: false }], filters: [] })
    expect(sut.toTab()).toMatchObject({ viewVersion: 1, isServerView: false })

    sut.applyView({ sort: [], filters: [{ column: 1, operator: 'contains', values: ['b'] }] })
    expect(sut.rowCount).toBe(1)
    expect(sut.toTab()).toMatchObject({ rowCount: 1, loadedRows: 3 })

    sut.applyView({ sort: [], filters: [] })
    expect(sut.rowCount).toBe(3)
    expect(sut.viewVersion).toBe(3)
  })

  it('should keep the rows with the text of the quick search in any column, through the view', () => {
    const sut = resultSet()
    sut.applyView({ sort: [{ column: 0, isDescending: true }], filters: [] })

    sut.searchFor('B')

    expect(sut.rows(0, 10)).toStrictEqual([['2', 'bbbbbbbbbb']])
    expect(sut.searchText).toBe('B')
    expect(sut.toTab()).toMatchObject({ search: 'B', rowCount: 1, loadedRows: 3, viewVersion: 2 })

    sut.searchFor('')
    expect(sut.rows(0, 10)).toStrictEqual([
      ['3', 'c'],
      ['2', 'bbbbbbbbbb'],
      ['1', null],
    ])
    expect(sut.viewVersion).toBe(3)
  })

  it('should search every row as it came without a view, and keep searching through a new view', () => {
    const sut = resultSet()

    sut.searchFor('1')
    expect(sut.rows(0, 10)).toStrictEqual([['1', null]])

    sut.applyView({ sort: [], filters: [{ column: 1, operator: 'contains', values: ['c'] }] })
    expect(sut.rowCount).toBe(0)
    sut.applyView({ sort: [], filters: [] })
    expect(sut.rows(0, 10)).toStrictEqual([['1', null]])
  })

  it('should search the rows of a view sorted by the server as they came, and keep it on the server', () => {
    const sut = resultSet()
    const view = { sort: [{ column: 0, isDescending: false }], filters: [] }
    sut.restart(view)
    sut.addRows([
      ['1', 'ann'],
      ['2', 'bob'],
      ['3', 'joanna'],
    ])

    sut.searchFor('ANN')

    expect(sut.rows(0, 10)).toStrictEqual([
      ['1', 'ann'],
      ['3', 'joanna'],
    ])
    expect(sut.isServerView).toBe(true)
    expect(sut.view).toStrictEqual(view)
  })

  it('should keep the order of the server, and search it without sorting it again here', () => {
    const sut = resultSet()
    sut.restart({ sort: [{ column: 1, isDescending: false }], filters: [] })
    // The server's collation put b before a.
    sut.addRows([
      ['1', 'b'],
      ['2', 'a'],
      ['3', 'c'],
    ])

    sut.searchFor('2')
    expect(sut.rows(0, 5)).toStrictEqual([['2', 'a']])
    sut.searchFor('')

    expect(sut.rows(0, 5)).toStrictEqual([
      ['1', 'b'],
      ['2', 'a'],
      ['3', 'c'],
    ])
  })

  it('should show again a row of NULLs once the quick search is cleared', () => {
    const sut = resultSet()
    sut.addRows([[null, null]])
    sut.searchFor('c')

    sut.searchFor('')

    expect(sut.rowCount).toBe(4)
    expect(sut.rows(3, 1)).toStrictEqual([[null, null]])
  })

  it('should search the rows of a run again once it ends, however it ends', () => {
    const endings: readonly ((tab: ResultSet) => void)[] = [
      (tab) => {
        tab.succeed({ durationMs: 1, affectedRows: null, isTruncated: false, autoLimit: null })
      },
      (tab) => {
        tab.fail({ message: 'x', line: null, column: null })
      },
      (tab) => {
        tab.cancel(1)
      },
    ]
    for (const end of endings) {
      const sut = resultSet()
      sut.searchFor('c')
      sut.restart({ sort: [], filters: [] })
      sut.addRows([
        ['7', 'cat'],
        ['8', 'dog'],
      ])
      expect(sut.rowCount).toBe(2)

      end(sut)

      expect(sut.rows(0, 10)).toStrictEqual([['7', 'cat']])
      expect(sut.viewVersion).toBe(3)
    }
  })

  it('should leave the rows of a run that ends as they came without a quick search', () => {
    const sut = resultSet()

    sut.succeed({ durationMs: 1, affectedRows: null, isTruncated: false, autoLimit: null })

    expect(sut.viewVersion).toBe(0)
    expect(sut.rowCount).toBe(3)
  })

  it('should read a table with another condition in the same tab', () => {
    const sut = resultSet({ sql: 'SELECT * FROM t', canRefresh: true })

    sut.readWith({
      sql: "SELECT * FROM t WHERE (a = 'x'\n) AND b = $1",
      values: [7],
      condition: "a = 'x'",
    })

    expect(sut.sql).toBe("SELECT * FROM t WHERE (a = 'x'\n) AND b = $1")
    expect(sut.values).toStrictEqual([7])
    expect(sut.tableFilter).toBe("a = 'x'")
    expect(sut.toTab()).toMatchObject({
      title: "SELECT * FROM t WHERE (a = 'x' ) AND b = $1",
      sql: "SELECT * FROM t WHERE (a = 'x'\n) AND b = $1",
      tableFilter: "a = 'x'",
    })
  })

  it('should record how the statement ended', () => {
    const succeeded = resultSet()
    succeeded.succeed({ durationMs: 5, affectedRows: null, isTruncated: true, autoLimit: 1000 }, [
      'plan',
    ])
    const failed = resultSet()
    failed.fail({ message: 'boom', line: 2, column: 3 })
    const cancelled = resultSet()
    cancelled.cancel(7)
    cancelled.addNotice('The transaction failed.')
    cancelled.addNotice('2 statements were not run')

    expect(succeeded.toTab()).toMatchObject({
      status: 'succeeded',
      summary: { durationMs: 5, affectedRows: null, isTruncated: true, autoLimit: 1000 },
      plan: ['plan'],
    })
    expect(succeeded.isRunning).toBe(false)
    expect(failed.toTab()).toMatchObject({
      status: 'failed',
      error: { message: 'boom', line: 2, column: 3 },
    })
    expect(cancelled.toTab()).toMatchObject({
      status: 'cancelled',
      summary: { durationMs: 7, affectedRows: null, isTruncated: false, autoLimit: null },
      notice: 'The transaction failed. 2 statements were not run',
    })
    expect(resultSet().toTab().plan).toStrictEqual([])
    const withoutPlan = resultSet()
    withoutPlan.succeed({ durationMs: 1, affectedRows: 2, isTruncated: false, autoLimit: null })
    expect(withoutPlan.toTab().plan).toStrictEqual([])
  })
})

describe('ResultSet in a table panel', () => {
  const ORDERS = { database: 'shop', schema: 'sales', name: 'orders' }
  const READ = {
    table: ORDERS,
    key: undefined,
    condition: "name <> 'x'",
    view: { filters: [], sort: [] },
    parameterTypes: new Map<string, string>(),
  }

  it('should give the query box the statement of its rows, the columns shown and its limit', () => {
    const sut = resultSet({ canRefresh: true })
    sut.showInBox({ table: READ, dialect: POSTGRES_DIALECT })
    sut.setLayout({ order: ['name'], hidden: [] })
    expect(sut.toTab().queryBox).toStrictEqual({
      sql: 'SELECT * FROM "sales"."orders" WHERE (name <> \'x\'\n)',
      isCustom: false,
    })

    sut.setLayout({ order: ['name'], hidden: ['id'] })
    sut.succeed({ durationMs: 1, affectedRows: null, isTruncated: true, autoLimit: 100 })

    expect(sut.toTab().queryBox).toStrictEqual({
      sql: 'SELECT "name" FROM "sales"."orders" WHERE (name <> \'x\'\n) LIMIT 100',
      isCustom: false,
    })
  })

  it('should give it the query the user ran from it', () => {
    const sut = resultSet()
    sut.showInBox({ query: 'SELECT 1' })

    expect(sut.toTab().queryBox).toStrictEqual({ sql: 'SELECT 1', isCustom: true })
  })
})
