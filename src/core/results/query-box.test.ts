import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { DEFAULT_LAYOUT } from '../grid/column-layout.ts'
import { FilterOperator } from './conditions.ts'
import { boxQuery, BoxQueryProblem, queryBoxText, shownNames } from './query-box.ts'
import type { TableRead } from './table-query.ts'

const ORDERS = { database: 'shop', schema: 'sales', name: 'orders' }
const COLUMNS = [{ name: 'id' }, { name: 'code' }, { name: 'total' }]
const READ: TableRead = {
  table: ORDERS,
  key: { parts: [{ column: 'id', value: '9007199254740993' }], isRowKey: true },
  condition: "code LIKE 'A%' -- the A codes",
  view: {
    filters: [
      {
        filter: { column: 2, operator: FilterOperator.Greater, values: ['10.50'] },
        name: 'total',
        parameterType: 'NUMERIC',
      },
    ],
    sort: [{ key: { column: 1, isDescending: true }, name: 'code' }],
  },
  parameterTypes: new Map([['id', 'BIGINT']]),
}
const SHAPE = { columns: COLUMNS, layout: DEFAULT_LAYOUT, autoLimit: 100 }

describe('queryBoxText', () => {
  it('should write the statement of the rows of a table with its values, sort and limit', () => {
    const sut = queryBoxText({ table: READ, dialect: POSTGRES_DIALECT }, SHAPE)

    expect(sut).toStrictEqual({
      sql: [
        'SELECT * FROM "sales"."orders" WHERE "id" = 9007199254740993 AND (code LIKE \'A%\' -- the A codes',
        ') AND "total" > 10.50',
        'ORDER BY "code" DESC LIMIT 100',
      ].join('\n'),
      isCustom: false,
    })
  })

  it('should write it as the database writes its names, without a limit when none applied', () => {
    const read = { ...READ, key: undefined, condition: '', view: { filters: [], sort: [] } }
    const sut = queryBoxText(
      { table: read, dialect: MYSQL_DIALECT },
      { ...SHAPE, layout: { order: ['total'], hidden: ['id'] }, autoLimit: null },
    )

    expect(sut).toStrictEqual({
      sql: 'SELECT `total`, `code` FROM `sales`.`orders`',
      isCustom: false,
    })
  })

  it('should leave the box empty for a condition it cannot write', () => {
    const read = { ...READ, condition: 'id = 1; DELETE FROM orders' }

    expect(queryBoxText({ table: read, dialect: POSTGRES_DIALECT }, SHAPE)).toStrictEqual({
      sql: '',
      isCustom: false,
    })
  })

  it('should give back the query the user ran, as it ran', () => {
    expect(queryBoxText({ query: 'SELECT 1\n' }, SHAPE)).toStrictEqual({
      sql: 'SELECT 1\n',
      isCustom: true,
    })
  })
})

describe('shownNames', () => {
  it('should name the columns shown in their order only when some are hidden', () => {
    expect(shownNames({ columns: COLUMNS, layout: DEFAULT_LAYOUT })).toStrictEqual([])
    expect(shownNames({ columns: COLUMNS, layout: { order: ['code'], hidden: [] } })).toStrictEqual(
      [],
    )
    expect(
      shownNames({ columns: COLUMNS, layout: { order: ['total', 'id'], hidden: ['code'] } }),
    ).toStrictEqual(['total', 'id'])
  })
})

describe('boxQuery', () => {
  it('should run the one statement, without its semicolon and the comments around it', () => {
    expect(
      boxQuery('  -- the lines\nSELECT * FROM lines;  ', POSTGRES_DIALECT.lexical),
    ).toStrictEqual({ sql: 'SELECT * FROM lines' })
    expect(boxQuery("SELECT ';' AS x", POSTGRES_DIALECT.lexical)).toStrictEqual({
      sql: "SELECT ';' AS x",
    })
  })

  it('should refuse nothing to run and more than one statement', () => {
    expect(boxQuery(' -- nothing\n ;', POSTGRES_DIALECT.lexical)).toStrictEqual({
      problem: BoxQueryProblem.Empty,
    })
    expect(boxQuery('SELECT 1; SELECT 2', POSTGRES_DIALECT.lexical)).toStrictEqual({
      problem: BoxQueryProblem.Statements,
    })
    expect(BoxQueryProblem.Statements).toContain('one statement at a time')
  })
})
