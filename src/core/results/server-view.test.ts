import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { ColumnKind, type ResultColumn } from '../engine/query.ts'
import { serverViewProblem, serverViewQuery } from './server-view.ts'
import { IDENTITY_VIEW } from './view.ts'

const COLUMNS: readonly ResultColumn[] = [
  { name: 'id', dataType: 'INT8', kind: ColumnKind.Number },
  { name: 'Name', dataType: 'TEXT', kind: ColumnKind.Text },
  { name: 'dup', dataType: 'TEXT', kind: ColumnKind.Text },
  { name: 'dup', dataType: 'TEXT', kind: ColumnKind.Text },
]
const SELECT = 'SELECT * FROM t -- all'

describe('serverViewProblem', () => {
  it('should accept a query that only reads', () => {
    expect(serverViewProblem(SELECT, POSTGRES_DIALECT)).toBeUndefined()
  })

  it('should explain why a statement cannot run again', () => {
    expect(serverViewProblem('DELETE FROM t', POSTGRES_DIALECT)).toBe(
      'Only a single query that reads (SELECT, WITH, TABLE or VALUES) can be sorted and filtered by the server',
    )
  })
})

describe('serverViewQuery', () => {
  it('should wrap the query with bound filters and the sort, in PostgreSQL', () => {
    const view = {
      sort: [
        { column: 1, isDescending: true },
        { column: 0, isDescending: false },
      ],
      filters: [
        { column: 1, text: '50%_Off\\' },
        { column: 0, text: '' },
        { column: 0, text: '9' },
      ],
    }

    expect(
      serverViewQuery(SELECT, view, { columns: COLUMNS, dialect: POSTGRES_DIALECT }),
    ).toStrictEqual({
      sql: [
        'SELECT * FROM (',
        SELECT,
        ') AS sqldoro_view',
        'WHERE LOWER(CAST("Name" AS TEXT)) LIKE $1 AND LOWER(CAST("id" AS TEXT)) LIKE $2',
        'ORDER BY "Name" DESC, "id" ASC',
      ].join('\n'),
      values: ['%50\\%\\_off\\\\%', '%9%'],
    })
  })

  it('should use the placeholders and the text type of MySQL', () => {
    const view = {
      sort: [],
      filters: [
        { column: 1, text: 'a' },
        { column: 0, text: 'b' },
      ],
    }

    expect(
      serverViewQuery('SELECT 1', view, { columns: COLUMNS, dialect: MYSQL_DIALECT })?.sql,
    ).toBe(
      'SELECT * FROM (\nSELECT 1\n) AS sqldoro_view\nWHERE LOWER(CAST(`Name` AS CHAR)) LIKE ? AND LOWER(CAST(`id` AS CHAR)) LIKE ?',
    )
  })

  it('should run the query as it is for the identity view', () => {
    expect(
      serverViewQuery(SELECT, IDENTITY_VIEW, { columns: COLUMNS, dialect: POSTGRES_DIALECT }),
    ).toStrictEqual({
      sql: `SELECT * FROM (\n${SELECT}\n) AS sqldoro_view`,
      values: [],
    })
  })

  it('should refuse statements that are not safe to run again', () => {
    expect(
      serverViewQuery('UPDATE t SET a = 1', IDENTITY_VIEW, {
        columns: COLUMNS,
        dialect: POSTGRES_DIALECT,
      }),
    ).toBeUndefined()
  })

  it('should refuse to name a column that is not unique or does not exist', () => {
    const target = { columns: COLUMNS, dialect: POSTGRES_DIALECT }

    expect(
      serverViewQuery(SELECT, { sort: [{ column: 2, isDescending: false }], filters: [] }, target),
    ).toBeUndefined()
    expect(
      serverViewQuery(SELECT, { sort: [], filters: [{ column: 3, text: 'x' }] }, target),
    ).toBeUndefined()
    expect(
      serverViewQuery(SELECT, { sort: [{ column: 9, isDescending: false }], filters: [] }, target),
    ).toBeUndefined()
  })
})
