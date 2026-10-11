import { describe, expect, it } from 'vitest'

import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { ColumnKind } from '../../core/engine/query.ts'
import { FilterOperator } from '../../core/results/conditions.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { refreshOf, wasLimited } from './refresh-rows.ts'

const NAME = { name: 'name', dataType: 'TEXT', kind: ColumnKind.Text }

function tab(canRefresh: boolean): ResultSet {
  const sut = new ResultSet({
    values: canRefresh ? [7] : [],
    id: 't',
    sql: canRefresh ? 'SELECT * FROM "t" WHERE "id" = $1' : 'SELECT name FROM t',
    kind: 'rows',
    canServerView: true,
    canRefresh,
  })
  sut.describe([NAME])
  sut.addRows([['b'], ['a']])
  sut.succeed({ durationMs: 1, affectedRows: null, isTruncated: false, autoLimit: null })
  return sut
}

describe('refreshOf', () => {
  it('should read the query of an editor again, or its view on the server', () => {
    const sut = tab(false)
    expect(refreshOf(sut, POSTGRES_DIALECT)).toStrictEqual({
      sql: 'SELECT name FROM t',
      values: [],
      isServerView: false,
      shouldAutoLimit: false,
    })

    sut.restart({
      sort: [{ column: 0, isDescending: false }],
      filters: [{ column: 0, operator: FilterOperator.Contains, values: ['a'] }],
    })

    expect(refreshOf(sut, POSTGRES_DIALECT)).toStrictEqual({
      sql: 'SELECT * FROM (\nSELECT name FROM t\n) AS sqldoro_view\nWHERE LOWER(CAST("name" AS TEXT)) LIKE $1\nORDER BY "name" ASC',
      values: ['%a%'],
      isServerView: true,
      shouldAutoLimit: true,
    })
  })

  it('should read the statement of a table panel again as it is: it holds its view and its values', () => {
    const sut = tab(true)
    sut.restart({ sort: [{ column: 0, isDescending: true }], filters: [] })

    expect(refreshOf(sut, POSTGRES_DIALECT)).toStrictEqual({
      sql: 'SELECT * FROM "t" WHERE "id" = $1',
      values: [7],
      isServerView: true,
      shouldAutoLimit: true,
    })
  })
})

describe('wasLimited', () => {
  it('should read with the automatic limit what was read with it, or not read yet', () => {
    const limited = tab(false)
    limited.succeed({ durationMs: 1, affectedRows: null, isTruncated: true, autoLimit: 10 })

    expect(wasLimited(limited)).toBe(true)
    expect(wasLimited(tab(false))).toBe(false)
    limited.restart({ sort: [], filters: [] })
    expect(wasLimited(limited)).toBe(true)
  })
})
