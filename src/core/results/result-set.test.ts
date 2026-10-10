import { describe, expect, it } from 'vitest'

import { RESULT_COLUMNS } from '../../../test/fixtures/results.ts'
import { NOT_EDITING } from '../edits/tab-editor.ts'
import { ResultSet } from './result-set.ts'

const SQL = 'SELECT id, name\nFROM orders'

function resultSet(changes: Partial<ConstructorParameters<typeof ResultSet>[0]> = {}): ResultSet {
  const sut = new ResultSet({
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
      columns: [],
      rowCount: 0,
      loadedRows: 0,
      view: { sort: [], filters: [] },
      viewVersion: 0,
      isServerView: false,
      canServerView: true,
      canRefresh: false,
      summary: null,
      error: null,
      notice: '',
      plan: [],
      editing: NOT_EDITING,
    })
    expect(sut.isRunning).toBe(true)
    expect(sut.id).toBe('t1')
    expect(sut.sql).toBe(SQL)
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

    sut.applyView({ sort: [], filters: [{ column: 1, text: 'b' }] })
    expect(sut.rowCount).toBe(1)
    expect(sut.toTab()).toMatchObject({ rowCount: 1, loadedRows: 3 })

    sut.applyView({ sort: [], filters: [] })
    expect(sut.rowCount).toBe(3)
    expect(sut.viewVersion).toBe(3)
  })

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

  it('should project a range of the view onto its columns', () => {
    const sut = resultSet()
    sut.applyView({ sort: [{ column: 0, isDescending: true }], filters: [] })

    expect(sut.project({ firstRow: 0, lastRow: 1, firstColumn: 1, lastColumn: 1 })).toStrictEqual({
      columns: [RESULT_COLUMNS[1]],
      rows: [['c'], ['bbbbbbbbbb']],
    })
    expect(
      sut.project({ firstRow: 1, lastRow: 1, firstColumn: 0, lastColumn: 0 }).rows,
    ).toHaveLength(1)
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
      new ResultSet({ id: 't', sql, kind: 'rows', canServerView: false, canRefresh: false }).toTab()
        .sql,
    ).toHaveLength(2000)
  })
})
