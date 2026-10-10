import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { tableDataQuery, tableDataTitle } from './table-data.ts'

const ORDERS = { database: 'shop', schema: 'sales', name: 'orders' }
// In MySQL the explorer names the database as the schema of its tables.
const MYSQL_ORDERS = { database: 'shop', schema: 'shop', name: 'orders' }

describe('tableDataQuery', () => {
  it('should read every column of the table in its PostgreSQL schema', () => {
    expect(tableDataQuery(ORDERS, POSTGRES_DIALECT)).toBe('SELECT * FROM "sales"."orders"')
  })

  it('should read every column of the table in its MySQL database', () => {
    expect(tableDataQuery(MYSQL_ORDERS, MYSQL_DIALECT)).toBe('SELECT * FROM `shop`.`orders`')
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

describe('tableDataTitle', () => {
  it('should name the table, then its schema', () => {
    expect(tableDataTitle(ORDERS)).toBe('orders — sales')
  })

  it('should name the table, then its database in MySQL', () => {
    expect(tableDataTitle(MYSQL_ORDERS)).toBe('orders — shop')
  })
})
