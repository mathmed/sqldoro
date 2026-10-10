import { describe, expect, it, vi } from 'vitest'

import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { ORDERS, ORDERS_RESULT, ORDERS_TABLE } from '../../../test/fixtures/tables.ts'
import type { TableDescription } from '../engine/table.ts'
import { resultEditability } from './result-editability.ts'
import { ShapeProblem } from './select-shape.ts'

// The catalog of the server: what it says of the table of the rows.
function catalogWith(description: TableDescription | undefined): {
  readonly describeTable: ReturnType<
    typeof vi.fn<
      (database: string, table: readonly string[]) => Promise<TableDescription | undefined>
    >
  >
} {
  return { describeTable: vi.fn(async () => Promise.resolve(description)) }
}

const ROWS = {
  sql: 'SELECT * FROM sales.orders',
  columns: ORDERS_RESULT,
  dialect: POSTGRES_DIALECT,
  database: 'shop',
}

describe('resultEditability', () => {
  it('should edit the rows of the table the text names and the server describes', async () => {
    const catalog = catalogWith(ORDERS)

    const sut = await resultEditability(catalog, ROWS)

    expect(sut).toMatchObject({ table: { label: 'sales.orders', key: [0] } })
    expect(catalog.describeTable).toHaveBeenCalledExactlyOnceWith('shop', ORDERS_TABLE)
  })

  it('should say what the text of the query does not allow, without reading the catalog', async () => {
    const catalog = catalogWith(ORDERS)

    const sut = await resultEditability(catalog, {
      ...ROWS,
      sql: 'SELECT * FROM sales.orders o JOIN sales.lines l ON l.order_id = o.id',
    })

    expect(sut).toStrictEqual({ problem: ShapeProblem.Join })
    expect(catalog.describeTable).not.toHaveBeenCalled()
  })

  it('should say when the server does not tell where a column comes from', async () => {
    const catalog = catalogWith(ORDERS)

    const sut = await resultEditability(catalog, {
      ...ROWS,
      columns: [...ORDERS_RESULT, { name: 'total', dataType: 'INT4', kind: 'number' }],
    })

    expect(sut).toStrictEqual({
      problem: 'The server does not say which table "total" comes from.',
    })
    expect(catalog.describeTable).not.toHaveBeenCalled()
  })

  it('should say when the catalog does not know the table', async () => {
    const sut = await resultEditability(catalogWith(undefined), ROWS)

    expect(sut).toStrictEqual({
      problem: 'sqldoro cannot find the table of these rows in the catalog.',
    })
  })
})
