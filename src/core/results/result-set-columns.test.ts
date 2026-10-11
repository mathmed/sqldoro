import { describe, expect, it } from 'vitest'

import { RESULT_COLUMNS } from '../../../test/fixtures/results.ts'
import { NO_META } from './result-meta.ts'
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

describe('ResultSet, its cells, columns and progress', () => {
  it('should send windows of rows with long text cut', () => {
    expect(resultSet().window(1, 2, 4)).toStrictEqual([
      { cells: ['1', null], truncated: [] },
      { cells: ['2', 'bbbb'], truncated: [1] },
    ])
  })

  it('should give the whole value of a cell, NULL past the end', () => {
    const sut = resultSet()

    expect(sut.cell(2, 1)).toBe('bbbbbbbbbb')
    expect(sut.cell(1, 1)).toBeNull()
    expect(sut.cell(9, 0)).toBeNull()
    expect(sut.cell(0, 9)).toBeNull()
  })

  it('should project a block of the view onto its columns, in the order shown', () => {
    const sut = resultSet()
    sut.applyView({ sort: [{ column: 0, isDescending: true }], filters: [] })

    expect(sut.project({ firstRow: 0, lastRow: 1, columns: [1] })).toStrictEqual({
      columns: [RESULT_COLUMNS[1]],
      rows: [['c'], ['bbbbbbbbbb']],
    })
    expect(sut.project({ firstRow: 1, lastRow: 1, columns: [1, 0] })).toStrictEqual({
      columns: [RESULT_COLUMNS[1], RESULT_COLUMNS[0]],
      rows: [['bbbbbbbbbb', '2']],
    })
  })

  it('should keep the layout of the columns and show the columns it keeps', () => {
    const sut = resultSet()
    sut.setLayout({ order: ['name'], hidden: [] })

    expect(sut.shownColumns).toStrictEqual([1, 0])
    expect(sut.layout).toStrictEqual({ order: ['name'], hidden: [] })
    sut.setLayout({ order: ['name'], hidden: ['id'] })
    expect(sut.shownColumns).toStrictEqual([1])
    expect(sut.toTab().layout).toStrictEqual({ order: ['name'], hidden: ['id'] })
  })

  it('should give the whole row a position of the view shows', () => {
    const sut = resultSet()
    sut.applyView({ sort: [{ column: 0, isDescending: false }], filters: [] })

    expect(sut.viewRow(0)).toStrictEqual(['1', null])
    expect(sut.viewRow(3)).toBeUndefined()
  })

  it('should give the values a column holds', () => {
    expect(resultSet().distinct(1, 10)).toStrictEqual({
      values: ['bbbbbbbbbb', 'c'],
      isComplete: true,
    })
  })

  it('should keep what the catalog said of the columns while they stay the same', () => {
    const sut = resultSet()
    const meta = {
      ...NO_META,
      columns: [
        { choices: [], reference: 'customers (id)' },
        { choices: ['a'], reference: '' },
      ],
      referenceLabels: ['lines (order_id)'],
      parameterTypes: new Map([['id', 'SIGNED']]),
    }
    sut.describeMeta(meta)

    expect(sut.toTab()).toMatchObject({
      meta: meta.columns,
      references: [{ label: 'lines (order_id)' }],
    })
    expect(sut.parameterTypes).toBe(meta.parameterTypes)
    sut.describe(RESULT_COLUMNS)
    expect(sut.meta).toBe(meta)
    sut.describe(RESULT_COLUMNS.slice(0, 1))
    expect(sut.meta).toBe(NO_META)
  })

  it('should say where a statement is while it waits', () => {
    const sut = new ResultSet({
      values: [],
      id: 't1',
      sql: SQL,
      kind: 'rows',
      canServerView: false,
      canRefresh: true,
    })
    sut.waitForSession()

    expect(sut.toTab().progress).toBe('connecting')
    sut.restart({ sort: [], filters: [] })
    expect(sut.toTab().progress).toBe('running')
    sut.describe(RESULT_COLUMNS)
    expect(sut.toTab().progress).toBe('fetching')
    sut.succeed({ durationMs: 1, affectedRows: null, isTruncated: false, autoLimit: null })
    expect(sut.toTab().progress).toBe('done')
    sut.restart({ sort: [], filters: [] })
    expect(sut.toTab().progress).toBe('running')
  })

  it('should stop waiting for its session when the read fails', () => {
    const sut = resultSet()
    sut.waitForSession()
    sut.fail({ message: 'no', line: null, column: null })

    expect(sut.toTab().progress).toBe('done')
  })

  it('should start over for a run on the server with the view it applies', () => {
    const sut = resultSet()
    sut.applyView({ sort: [{ column: 0, isDescending: false }], filters: [] })
    sut.fail({ message: 'x', line: null, column: null })

    sut.restart({ sort: [{ column: 1, isDescending: true }], filters: [] })

    expect(sut.toTab()).toMatchObject({
      status: 'running',
      rowCount: 0,
      loadedRows: 0,
      isServerView: true,
      viewVersion: 2,
      error: null,
      summary: null,
      view: { sort: [{ column: 1, isDescending: true }], filters: [] },
    })
    expect(sut.isServerView).toBe(true)
    sut.addRows([['9', 'z']])
    expect(sut.rows(0, 5)).toStrictEqual([['9', 'z']])

    sut.restart({ sort: [], filters: [] })
    expect(sut.toTab().isServerView).toBe(false)
    expect(sut.isServerView).toBe(false)
  })

  it('should not offer the server view for plans or statements that cannot run again', () => {
    expect(resultSet({ kind: 'plan' }).toTab().canServerView).toBe(false)
    expect(resultSet({ canServerView: false }).toTab().canServerView).toBe(false)
  })

  it('should offer to read the rows again only when it was made to', () => {
    const sut = resultSet({ canRefresh: true })

    expect(sut.canRefresh).toBe(true)
    expect(sut.toTab().canRefresh).toBe(true)
    expect(resultSet().canRefresh).toBe(false)
  })

  it('should cut a long statement in the tab', () => {
    const sql = `SELECT ${'x'.repeat(3000)}`

    expect(
      new ResultSet({
        values: [],
        id: 't',
        sql,
        kind: 'rows',
        canServerView: false,
        canRefresh: false,
      }).toTab().sql,
    ).toHaveLength(2000)
  })
})
