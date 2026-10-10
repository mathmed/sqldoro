import { describe, expect, it } from 'vitest'

import {
  type ForeignKeyColumn,
  groupForeignKeyColumns,
  groupIndexColumns,
  type IndexColumn,
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
