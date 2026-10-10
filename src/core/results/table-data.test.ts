import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import {
  tableDataLabel,
  tableDataQuery,
  TableFilterProblem,
  tableFilterQuery,
  tablePanelTitle,
} from './table-data.ts'

const ORDERS = { database: 'shop', schema: 'sales', name: 'orders' }
// In MySQL the explorer names the database as the schema of its tables.
const MYSQL_ORDERS = { database: 'shop', schema: 'shop', name: 'orders' }
const POSTGRES_READ = 'SELECT * FROM "sales"."orders"'
const MYSQL_READ = 'SELECT * FROM `shop`.`orders`'

describe('tableDataQuery', () => {
  it('should read every column of the table in its PostgreSQL schema', () => {
    expect(tableDataQuery(ORDERS, POSTGRES_DIALECT)).toBe(POSTGRES_READ)
  })

  it('should read every column of the table in its MySQL database', () => {
    expect(tableDataQuery(MYSQL_ORDERS, MYSQL_DIALECT)).toBe(MYSQL_READ)
  })

  it('should quote names that need it, so that they read as names and nothing else', () => {
    const odd = { database: 'shop', schema: 'my "sales"', name: 'orders; DROP TABLE x' }

    expect(tableDataQuery(odd, POSTGRES_DIALECT)).toBe(
      'SELECT * FROM "my ""sales"""."orders; DROP TABLE x"',
    )
  })

  it('should refuse a table without a schema instead of reading another one', () => {
    expect(() => tableDataQuery({ ...ORDERS, schema: '' }, POSTGRES_DIALECT)).toThrow(RangeError)
  })
})

describe('tableFilterQuery', () => {
  it('should read every row without a condition, or with a blank one', () => {
    expect(tableFilterQuery(ORDERS, '', POSTGRES_DIALECT)).toStrictEqual({ sql: POSTGRES_READ })
    expect(tableFilterQuery(ORDERS, ' \n\t', POSTGRES_DIALECT)).toStrictEqual({
      sql: POSTGRES_READ,
    })
  })

  it('should put the condition as typed in parentheses closed on a line of their own', () => {
    expect(tableFilterQuery(ORDERS, "status = 'active'", POSTGRES_DIALECT)).toStrictEqual({
      sql: `${POSTGRES_READ} WHERE (status = 'active'\n)`,
    })
    expect(tableFilterQuery(MYSQL_ORDERS, 'id > 3 # big ones', MYSQL_DIALECT)).toStrictEqual({
      sql: `${MYSQL_READ} WHERE (id > 3 # big ones\n)`,
    })
  })

  it('should keep a -- comment at the end of the condition from hiding the parenthesis', () => {
    expect(tableFilterQuery(ORDERS, 'id = 1 -- the first', POSTGRES_DIALECT)).toStrictEqual({
      sql: `${POSTGRES_READ} WHERE (id = 1 -- the first\n)`,
    })
  })

  it('should take semicolons, parentheses and quotes inside strings, names and comments', () => {
    const condition = `note = 'a;b)' AND "odd;)" IS NULL /* ; ( */ AND (id IN (1, 2))`

    expect(tableFilterQuery(ORDERS, condition, POSTGRES_DIALECT)).toStrictEqual({
      sql: `${POSTGRES_READ} WHERE (${condition}\n)`,
    })
  })

  it.each([
    ['id = 1;', TableFilterProblem.Statements],
    ['id = 1; DELETE FROM orders', TableFilterProblem.Statements],
    [';', TableFilterProblem.Statements],
    ["note = 'open", TableFilterProblem.Unclosed],
    ['"odd = 1', TableFilterProblem.Unclosed],
    ['id = 1 /* the first', TableFilterProblem.Unclosed],
    ['-- nothing', TableFilterProblem.Empty],
    ['/* nothing */', TableFilterProblem.Empty],
    ['id = 1) OR (1 = 1', TableFilterProblem.Parentheses],
    ['id = 1) UNION SELECT * FROM users WHERE (true', TableFilterProblem.Parentheses],
    ['(id = 1', TableFilterProblem.Parentheses],
    ['id = 1)', TableFilterProblem.Parentheses],
  ])('should refuse the PostgreSQL condition %j', (condition, problem) => {
    expect(tableFilterQuery(ORDERS, condition, POSTGRES_DIALECT)).toStrictEqual({ problem })
  })

  it('should refuse a second statement hidden in a MySQL executable comment', () => {
    expect(
      tableFilterQuery(MYSQL_ORDERS, 'id = 1 /*! ; DELETE FROM orders */', MYSQL_DIALECT),
    ).toStrictEqual({ problem: TableFilterProblem.Statements })
    expect(tableFilterQuery(MYSQL_ORDERS, '/*! */', MYSQL_DIALECT)).toStrictEqual({
      problem: TableFilterProblem.Empty,
    })
  })

  it('should read the strings of each dialect as they are written', () => {
    const escaped = String.raw`note = 'it\'s;'`

    expect(tableFilterQuery(MYSQL_ORDERS, escaped, MYSQL_DIALECT)).toStrictEqual({
      sql: `${MYSQL_READ} WHERE (${escaped}\n)`,
    })
    expect(tableFilterQuery(ORDERS, escaped, POSTGRES_DIALECT)).toStrictEqual({
      problem: TableFilterProblem.Unclosed,
    })
  })
})

describe('tableDataLabel', () => {
  it('should name the table, then its schema', () => {
    expect(tableDataLabel(ORDERS)).toBe('orders — sales')
  })

  it('should name the table, then its database in MySQL', () => {
    expect(tableDataLabel(MYSQL_ORDERS)).toBe('orders — shop')
  })
})

describe('tablePanelTitle', () => {
  it('should name the connection, the database, then the schema and the table', () => {
    expect(tablePanelTitle('Shop', ORDERS, POSTGRES_DIALECT)).toBe('Shop/shop/sales.orders')
  })

  it('should name the connection, the database, then the table alone in MySQL', () => {
    expect(tablePanelTitle('CRM', MYSQL_ORDERS, MYSQL_DIALECT)).toBe('CRM/shop/orders')
  })
})
