import { describe, expect, it } from 'vitest'

import {
  ORDERS,
  ORDERS_RESULT,
  ORDERS_TABLE,
  ordersColumn,
  tableColumn,
} from '../../../test/fixtures/tables.ts'
import { ColumnKind } from '../engine/query.ts'
import { RelationKind, type TableDescription, ValueType } from '../engine/table.ts'
import { editableTable, type EditTarget, resultOrigin } from './editability.ts'

const REFERENCE = { parts: ['sales', 'orders'] }

function target(changes: Partial<EditTarget> = {}): EditTarget {
  return { reference: REFERENCE, columns: ORDERS_RESULT, description: ORDERS, ...changes }
}

function problemOf(changes: Partial<EditTarget>): string | undefined {
  const editability = editableTable(target(changes))
  return 'problem' in editability ? editability.problem : undefined
}

describe('resultOrigin', () => {
  it('should name the table every column comes from', () => {
    expect(resultOrigin(ORDERS_RESULT)).toStrictEqual({ table: ORDERS_TABLE })
  })

  it('should refuse a column the server gives no origin', () => {
    const computed = { name: 'total * 2', dataType: 'NUMERIC', kind: ColumnKind.Number }

    expect(resultOrigin([ordersColumn('id'), computed])).toStrictEqual({
      problem: 'The server does not say which table "total * 2" comes from.',
    })
  })

  it('should refuse columns of several tables, and no columns at all', () => {
    const other = { ...ordersColumn('id'), origin: { table: ['16600'], column: '1' } }

    expect(resultOrigin([ordersColumn('id'), other])).toStrictEqual({
      problem: 'The columns of the query come from several tables.',
    })
    expect(resultOrigin([])).toStrictEqual({ problem: 'The query returns no columns.' })
  })
})

describe('editableTable', () => {
  it('should edit the table by its primary key, column by column', () => {
    const editability = editableTable(target())

    expect(editability).toMatchObject({
      table: { name: ['sales', 'orders'], label: 'sales.orders', key: [0], insertProblem: '' },
    })
    expect('table' in editability && editability.table.columns).toStrictEqual(
      ORDERS.columns.map((column) => ({
        name: column.name,
        value: column.isWritable
          ? column.value
          : { type: ValueType.ReadOnly, reason: 'The server computes this column.' },
        sql: column.sql,
        isNullable: column.isNullable,
        hasDefault: column.hasDefault,
      })),
    )
  })

  it('should map result columns to table columns by what the server says, not by their names', () => {
    const columns = [ordersColumn('ident', 'id'), ordersColumn('id', 'note')]

    expect(editableTable(target({ columns }))).toMatchObject({
      table: { key: [0], columns: [{ name: 'id' }, { name: 'note' }] },
    })
  })

  it('should use another unique key without NULLs when the primary key is not shown', () => {
    const columns = [ordersColumn('note'), ordersColumn('code')]

    expect(editableTable(target({ columns }))).toMatchObject({ table: { key: [1] } })
  })

  it('should keep the order of a composite key', () => {
    const description: TableDescription = {
      ...ORDERS,
      columns: [tableColumn('order_id'), tableColumn('line'), tableColumn('qty')],
      keys: [['order_id', 'line']],
    }
    const columns = [ordersColumn('qty'), ordersColumn('line'), ordersColumn('order_id')]

    expect(editableTable(target({ description, columns }))).toMatchObject({
      table: { key: [2, 1] },
    })
  })

  it('should refuse a composite key the result only shows part of', () => {
    const description: TableDescription = {
      ...ORDERS,
      columns: [tableColumn('order_id'), tableColumn('line'), tableColumn('qty')],
      keys: [['order_id', 'line']],
    }
    const columns = [ordersColumn('order_id'), ordersColumn('qty')]

    expect(problemOf({ description, columns })).toBe(
      'The result does not include the primary key of sales.orders (order_id, line) or another unique key without NULLs that sqldoro can compare: add it to the query to edit rows.',
    )
  })

  it('should refuse a result without a key it can compare', () => {
    const columns = [ordersColumn('note'), ordersColumn('total')]

    expect(problemOf({ columns })).toBe(
      'The result does not include the primary key of sales.orders (id) or another unique key without NULLs that sqldoro can compare: add it to the query to edit rows.',
    )
    expect(problemOf({ description: { ...ORDERS, keys: [] } })).toBe(
      'sales.orders has no primary key and no unique key without NULLs: sqldoro cannot tell its rows apart.',
    )
  })

  it.each([
    { type: ValueType.Float },
    { type: ValueType.Json },
    { type: ValueType.ReadOnly, reason: 'Binary values are shown read-only.' },
    { type: ValueType.Choice, options: ['a', 'b'], isMultiple: true },
  ] as const)('should not tell rows apart by a key of %j values', (value) => {
    const description = { ...ORDERS, columns: [tableColumn('id', { value })], keys: [['id']] }

    expect(problemOf({ description, columns: [ordersColumn('id')] })).toMatch(
      /^The result does not include the primary key of sales\.orders \(id\)/,
    )
  })

  it.each([
    { type: ValueType.Choice, options: ['a', 'b'], isMultiple: false },
    { type: ValueType.Server },
    { type: ValueType.Uuid },
    { type: ValueType.Timestamp, fraction: 6, hasTimeZone: true, minYear: 1, maxYear: 9999 },
  ] as const)('should tell rows apart by a key of %j values', (value) => {
    const description = { ...ORDERS, columns: [tableColumn('id', { value })], keys: [['id']] }

    expect(editableTable(target({ description, columns: [ordersColumn('id')] }))).toMatchObject({
      table: { key: [0] },
    })
  })

  it('should make read-only the columns the server computes, and those shown twice', () => {
    const columns = [ordersColumn('id'), ordersColumn('note'), ordersColumn('again', 'note')]
    const editability = editableTable(target({ columns }))

    expect('table' in editability && editability.table.columns.map(({ value }) => value)).toEqual([
      ORDERS.columns[0]?.value,
      {
        type: ValueType.ReadOnly,
        reason: 'This column shows more than once in the result: edit it where it shows once.',
      },
      {
        type: ValueType.ReadOnly,
        reason: 'This column shows more than once in the result: edit it where it shows once.',
      },
    ])
  })

  it('should keep the key of a column shown twice', () => {
    const columns = [ordersColumn('id'), ordersColumn('id')]

    expect(editableTable(target({ columns }))).toMatchObject({ table: { key: [0] } })
  })

  it('should say which columns adding a row needs', () => {
    const description: TableDescription = {
      ...ORDERS,
      columns: [
        ...ORDERS.columns,
        tableColumn('blob', { value: { type: ValueType.ReadOnly, reason: 'Binary.' } }),
      ],
    }
    const insertProblem = (columns: readonly ReturnType<typeof ordersColumn>[]): unknown => {
      const editability = editableTable(target({ description, columns }))
      return 'table' in editability ? editability.table.insertProblem : editability.problem
    }

    expect(insertProblem([ordersColumn('id'), ordersColumn('note')])).toBe(
      'Adding rows needs a value for code, blob: add them to the query, once.',
    )
    expect(
      insertProblem([
        ordersColumn('id'),
        ordersColumn('code'),
        ordersColumn('again', 'code'),
        ordersColumn('blob'),
      ]),
    ).toBe('Adding rows needs a value for code, blob: add them to the query, once.')
    expect(
      insertProblem([ordersColumn('id'), ordersColumn('code'), ordersColumn('total_cents')]),
    ).toBe('Adding rows needs a value for blob: add it to the query, once.')
  })

  it.each([
    [RelationKind.View, 'The rows come from a view: sqldoro only edits the rows of tables.'],
    [
      RelationKind.MaterializedView,
      'The rows come from a materialized view, which cannot be edited.',
    ],
    [
      RelationKind.ForeignTable,
      'The rows come from a foreign table: sqldoro only edits the rows of tables.',
    ],
    [RelationKind.Other, 'The rows do not come from a table.'],
  ])('should refuse the rows of a %s', (kind, problem) => {
    expect(problemOf({ description: { ...ORDERS, kind } })).toBe(problem)
  })

  it('should say what the relation is before whether the query names it', () => {
    expect(
      problemOf({
        description: { ...ORDERS, kind: RelationKind.View },
        reference: { parts: ['v'] },
      }),
    ).toBe('The rows come from a view: sqldoro only edits the rows of tables.')
  })

  it('should refuse a table its driver does not edit, and one the catalog does not know', () => {
    expect(problemOf({ description: { ...ORDERS, problem: 'MyISAM cannot roll back.' } })).toBe(
      'MyISAM cannot roll back.',
    )
    expect(problemOf({ description: undefined })).toBe(
      'sqldoro cannot find the table of these rows in the catalog.',
    )
  })

  it.each([[['orders']], [['SALES', 'Orders']], [['shop', 'sales', 'orders']]])(
    'should take %j as the name of sales.orders',
    (parts) => {
      expect(editableTable(target({ reference: { parts } }))).toHaveProperty('table')
    },
  )

  it.each([[['ONLY']], [['lines']], [['archive', 'orders']], [['sales', 'lines']]])(
    'should refuse rows the query names %j while the server says sales.orders',
    (parts) => {
      expect(problemOf({ reference: { parts } })).toBe(
        'The query and the server name different tables: sqldoro cannot tell which table the rows come from.',
      )
    },
  )

  it('should refuse columns the table does not have, naming them', () => {
    const columns = [
      ordersColumn('id'),
      { ...ordersColumn('gone'), origin: { table: ORDERS_TABLE, column: '99' } },
      { name: 'lost', dataType: 'TEXT', kind: ColumnKind.Text },
    ]

    expect(problemOf({ columns })).toBe('sqldoro cannot find "gone", "lost" in sales.orders.')
  })
})
