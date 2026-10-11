import { describe, expect, it } from 'vitest'

import { readRecord } from '../json/record.ts'
import {
  type ForeignKeyColumn,
  groupForeignKeyColumns,
  groupIndexColumns,
  groupReferenceColumns,
  type IndexColumn,
  readDatabaseStats,
  readTableStats,
  type ReferenceColumn,
} from './catalog.ts'

function indexColumn(
  index: string,
  column: string,
  overrides: Partial<IndexColumn> = {},
): IndexColumn {
  return { index, column, isUnique: false, isPrimary: false, ...overrides }
}

function foreignKeyColumn(
  constraint: string,
  column: string,
  referencedColumn: string,
): ForeignKeyColumn {
  return {
    constraint,
    column,
    referencedSchema: 'shop',
    referencedTable: 'customers',
    referencedColumn,
    onUpdate: 'NO ACTION',
    onDelete: 'CASCADE',
  }
}

describe('groupIndexColumns', () => {
  it('should return no index when there is no row', () => {
    expect(groupIndexColumns([])).toStrictEqual([])
  })

  it('should gather the columns of each index in key order', () => {
    const sut = groupIndexColumns([
      indexColumn('PRIMARY', 'id', { isUnique: true, isPrimary: true }),
      indexColumn('orders_customer', 'customer_id'),
      indexColumn('orders_customer', 'created_at'),
      indexColumn('orders_number', 'number', { isUnique: true }),
    ])

    expect(sut).toStrictEqual([
      { name: 'PRIMARY', columns: ['id'], isUnique: true, isPrimary: true },
      {
        name: 'orders_customer',
        columns: ['customer_id', 'created_at'],
        isUnique: false,
        isPrimary: false,
      },
      { name: 'orders_number', columns: ['number'], isUnique: true, isPrimary: false },
    ])
  })
})

describe('groupForeignKeyColumns', () => {
  it('should return no foreign key when there is no row', () => {
    expect(groupForeignKeyColumns([])).toStrictEqual([])
  })

  it('should pair the columns of each foreign key with the referenced ones', () => {
    const sut = groupForeignKeyColumns([
      foreignKeyColumn('orders_customer', 'customer_id', 'id'),
      foreignKeyColumn('orders_region', 'region', 'region'),
      foreignKeyColumn('orders_region', 'country', 'country'),
    ])

    expect(sut).toStrictEqual([
      {
        name: 'orders_customer',
        columns: ['customer_id'],
        referencedSchema: 'shop',
        referencedTable: 'customers',
        referencedColumns: ['id'],
        onUpdate: 'NO ACTION',
        onDelete: 'CASCADE',
      },
      {
        name: 'orders_region',
        columns: ['region', 'country'],
        referencedSchema: 'shop',
        referencedTable: 'customers',
        referencedColumns: ['region', 'country'],
        onUpdate: 'NO ACTION',
        onDelete: 'CASCADE',
      },
    ])
  })
})

describe('groupReferenceColumns', () => {
  it('should return no reference when there is no row', () => {
    expect(groupReferenceColumns([])).toStrictEqual([])
  })

  it('should group the columns of each foreign key of each table that points here', () => {
    const column = (
      table: string,
      constraint: string,
      columns: readonly [string, string],
    ): ReferenceColumn => ({
      schema: 'shop',
      table,
      constraint,
      column: columns[0],
      referencedColumn: columns[1],
    })

    expect(
      groupReferenceColumns([
        column('lines', 'fk_order', ['order_id', 'id']),
        column('lines', 'fk_order', ['order_region', 'region']),
        column('returns', 'fk_order', ['order_id', 'id']),
        { ...column('returns', 'fk_order', ['order_id', 'id']), schema: 'archive' },
      ]),
    ).toStrictEqual([
      {
        name: 'fk_order',
        schema: 'shop',
        table: 'lines',
        columns: ['order_id', 'order_region'],
        referencedColumns: ['id', 'region'],
      },
      {
        name: 'fk_order',
        schema: 'shop',
        table: 'returns',
        columns: ['order_id'],
        referencedColumns: ['id'],
      },
      {
        name: 'fk_order',
        schema: 'archive',
        table: 'returns',
        columns: ['order_id'],
        referencedColumns: ['id'],
      },
    ])
  })
})

describe('readTableStats', () => {
  it('should read the estimated rows and the size exactly', () => {
    const sut = readTableStats(
      readRecord({ name: 'orders', estimatedRows: '27412', sizeBytes: '9223372036854775807' }),
    )

    expect(sut).toStrictEqual({
      estimatedRows: 27_412n,
      sizeBytes: 9_223_372_036_854_775_807n,
    })
  })

  it('should leave out what the server does not know', () => {
    expect(
      readTableStats(readRecord({ name: 'remote', estimatedRows: null, sizeBytes: null })),
    ).toStrictEqual({ estimatedRows: undefined, sizeBytes: undefined })
  })

  it('should refuse statistics that are not whole numbers of 0 or more', () => {
    expect(() => readTableStats(readRecord({ estimatedRows: '-1', sizeBytes: '0' }))).toThrow(
      new TypeError('"estimatedRows" must be a whole number of 0 or more, as text'),
    )
    expect(() => readTableStats(readRecord({ estimatedRows: '0', sizeBytes: 16_384 }))).toThrow(
      new TypeError('"sizeBytes" must be a whole number of 0 or more, as text'),
    )
  })
})

describe('readDatabaseStats', () => {
  it('should read the size of a database, or none', () => {
    expect(readDatabaseStats(readRecord({ sizeBytes: '2147483648' }))).toStrictEqual({
      sizeBytes: 2_147_483_648n,
    })
    expect(readDatabaseStats(readRecord({ sizeBytes: null }))).toStrictEqual({
      sizeBytes: undefined,
    })
  })

  it('should refuse a size that is missing from the row', () => {
    expect(() => readDatabaseStats(readRecord({ name: 'shop' }))).toThrow(
      new TypeError('"sizeBytes" must be a whole number of 0 or more, as text'),
    )
  })
})
