import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { FilterOperator } from './conditions.ts'
import type { NamedView } from './server-view.ts'
import { TableFilterProblem } from './table-data.ts'
import {
  tableCountQuery,
  tableEditorSql,
  type TableRead,
  tableReadQuery,
  tableRowQuery,
} from './table-query.ts'

const ACCOUNTS = { database: 'bank', schema: 'public', name: 'CondominiumBankAccount' }
const NO_VIEW: NamedView = { filters: [], sort: [] }
const VIEW: NamedView = {
  filters: [
    {
      filter: { column: 2, operator: FilterOperator.GreaterOrEqual, values: ['10.50'] },
      name: 'balance',
      parameterType: 'DECIMAL(12,2)',
    },
    {
      filter: { column: 3, operator: FilterOperator.Contains, values: ["O'Brien"] },
      name: 'holder',
      parameterType: '',
    },
  ],
  sort: [{ key: { column: 0, isDescending: true }, name: 'id' }],
}
const READ: TableRead = {
  table: ACCOUNTS,
  key: { parts: [{ column: 'condominiumId', value: '9007199254740993' }], isRowKey: false },
  condition: "status = 'open' -- active ones",
  view: VIEW,
  parameterTypes: new Map([['condominiumId', 'SIGNED']]),
}

describe('tableReadQuery', () => {
  it('should read every row of the table without key, condition or view', () => {
    expect(
      tableReadQuery({ ...READ, key: undefined, condition: ' ', view: NO_VIEW }, POSTGRES_DIALECT),
    ).toStrictEqual({ sql: 'SELECT * FROM "public"."CondominiumBankAccount"', values: [] })
  })

  it('should bind the key and the filters around the condition, then sort', () => {
    expect(tableReadQuery(READ, MYSQL_DIALECT)).toStrictEqual({
      sql: [
        "SELECT * FROM `public`.`CondominiumBankAccount` WHERE `condominiumId` = CAST(? AS SIGNED) AND (status = 'open' -- active ones",
        ') AND `balance` >= CAST(? AS DECIMAL(12,2)) AND LOWER(CAST(`holder` AS CHAR)) LIKE ?',
        'ORDER BY `id` DESC',
      ].join('\n'),
      values: ['9007199254740993', '10.50', "%o'brien%"],
    })
  })

  it('should number the placeholders across the key and the filters in PostgreSQL', () => {
    const query = tableReadQuery({ ...READ, condition: '' }, POSTGRES_DIALECT)

    expect(query).toStrictEqual({
      sql: [
        'SELECT * FROM "public"."CondominiumBankAccount" WHERE "condominiumId" = CAST($1 AS SIGNED) AND "balance" >= CAST($2 AS DECIMAL(12,2)) AND LOWER(CAST("holder" AS TEXT)) LIKE $3',
        'ORDER BY "id" DESC',
      ].join('\n'),
      values: ['9007199254740993', '10.50', "%o'brien%"],
    })
  })

  it('should refuse a condition that does not stay one condition', () => {
    expect(
      tableReadQuery({ ...READ, condition: 'id = 1; DROP TABLE x' }, MYSQL_DIALECT),
    ).toStrictEqual({ problem: TableFilterProblem.Statements })
  })
})

describe('tableEditorSql', () => {
  it('should write the values in, for an editor that runs it as it is', () => {
    expect(tableEditorSql(READ, MYSQL_DIALECT, [])).toStrictEqual({
      sql: [
        "SELECT * FROM `public`.`CondominiumBankAccount` WHERE `condominiumId` = 9007199254740993 AND (status = 'open' -- active ones",
        ") AND `balance` >= 10.50 AND LOWER(CAST(`holder` AS CHAR)) LIKE '%o''brien%'",
        'ORDER BY `id` DESC',
      ].join('\n'),
    })
  })

  it('should select the columns shown, in their order', () => {
    expect(
      tableEditorSql({ ...READ, key: undefined, condition: '', view: NO_VIEW }, POSTGRES_DIALECT, [
        'holder',
        'id',
      ]),
    ).toStrictEqual({ sql: 'SELECT "holder", "id" FROM "public"."CondominiumBankAccount"' })
  })

  it('should refuse a condition the panel would refuse', () => {
    expect(tableEditorSql({ ...READ, condition: '(id = 1' }, POSTGRES_DIALECT, [])).toStrictEqual({
      problem: TableFilterProblem.Parentheses,
    })
  })
})

describe('tableCountQuery', () => {
  it('should count the rows a key leads to, with bound values', () => {
    expect(
      tableCountQuery(
        {
          table: ACCOUNTS,
          key: {
            parts: [
              { column: 'condominiumId', value: '9007199254740993' },
              { column: 'region', value: 'south' },
            ],
            isRowKey: false,
          },
          parameterTypes: new Map([['condominiumId', 'SIGNED']]),
        },
        MYSQL_DIALECT,
      ),
    ).toStrictEqual({
      sql: 'SELECT COUNT(*) AS `count` FROM `public`.`CondominiumBankAccount` WHERE `condominiumId` = CAST(? AS SIGNED) AND `region` = ?',
      values: ['9007199254740993', 'south'],
    })
  })
})

describe('tableRowQuery', () => {
  it('should read the row a key names, with bound values', () => {
    const sut = tableRowQuery(
      {
        table: ACCOUNTS,
        key: { parts: [{ column: 'id', value: 7 }], isRowKey: true },
        parameterTypes: new Map(),
      },
      POSTGRES_DIALECT,
    )

    expect(sut).toStrictEqual({
      sql: 'SELECT * FROM "public"."CondominiumBankAccount" WHERE "id" = $1',
      values: [7],
    })
  })
})
