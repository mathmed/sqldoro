import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import {
  MYSQL_ORDERS,
  MYSQL_ROW,
  POSTGRES_ORDERS,
  POSTGRES_ROW,
} from '../../../test/fixtures/edit-tables.ts'
import { ValueType } from '../engine/table.ts'
import type { EditableTable } from './editability.ts'
import { PendingKind, type PendingValue } from './pending.ts'
import {
  deleteStatement,
  EditVerb,
  insertStatement,
  type StatementTarget,
  updateStatement,
} from './statements.ts'

const POSTGRES: StatementTarget = { dialect: POSTGRES_DIALECT, table: POSTGRES_ORDERS }
const MYSQL: StatementTarget = { dialect: MYSQL_DIALECT, table: MYSQL_ORDERS }

function text(value: string): PendingValue {
  return { kind: PendingKind.Text, text: value }
}

const NULL: PendingValue = { kind: PendingKind.Null }
const DEFAULT: PendingValue = { kind: PendingKind.Default }

describe('updateStatement', () => {
  it('should set the new values where the key is the row and the cells still hold what was read', () => {
    const cells = new Map([
      [3, NULL],
      [2, text('gift')],
      [5, DEFAULT],
    ])

    expect(updateStatement(POSTGRES, { index: 4, original: POSTGRES_ROW, cells })).toStrictEqual({
      verb: EditVerb.Update,
      sql: 'UPDATE "sales"."orders" SET "note" = $1, "total" = NULL, "placed_at" = DEFAULT WHERE "id" = $2 AND "note" IS NULL AND "total" = $3 AND "placed_at" = $4',
      values: ['gift', '1', '12.50', '2026-01-02 03:04:05+00'],
      expectedRows: 1,
      row: { isNew: false, index: 4 },
      label: 'id = 1',
    })
  })

  it('should cast numbers and compare text exactly in MySQL', () => {
    const cells = new Map([
      [3, text('13.75')],
      [1, text('B-1')],
    ])

    expect(updateStatement(MYSQL, { index: 0, original: MYSQL_ROW, cells })).toMatchObject({
      sql: 'UPDATE `shop`.`orders` SET `code` = ?, `total` = CAST(? AS DECIMAL(10,2)) WHERE `id` = CAST(? AS SIGNED) AND `code` = ? COLLATE utf8mb4_bin AND `total` = CAST(? AS DECIMAL(10,2))',
      values: ['B-1', '13.75', '1', 'A-1', '12.50'],
    })
  })

  it.each([
    [
      POSTGRES,
      'UPDATE "sales"."orders" SET "payload" = $1 WHERE "id" = $2 AND CAST("payload" AS text) = $3',
    ],
    [
      MYSQL,
      'UPDATE `shop`.`orders` SET `payload` = ? WHERE `id` = CAST(? AS SIGNED) AND CAST(`payload` AS CHAR) = ? COLLATE utf8mb4_bin',
    ],
  ])('should compare JSON as the text the server writes', (target, sql) => {
    const cells = new Map([[4, text('{"b": 2}')]])

    expect(updateStatement(target, { index: 0, original: POSTGRES_ROW, cells })).toMatchObject({
      sql,
      values: ['{"b": 2}', '1', '{"a": 1}'],
    })
  })

  it('should change the key itself, found by its value as read', () => {
    const cells = new Map([[0, text('7')]])

    expect(updateStatement(POSTGRES, { index: 0, original: POSTGRES_ROW, cells })).toMatchObject({
      sql: 'UPDATE "sales"."orders" SET "id" = $1 WHERE "id" = $2',
      values: ['7', '1'],
    })
  })

  it('should keep hostile names quoted and hostile values out of the SQL', () => {
    const hostile = "x'); DROP TABLE orders; --"
    const table: EditableTable = {
      ...POSTGRES_ORDERS,
      name: ['we"ird', 'ta`ble'],
      columns: POSTGRES_ORDERS.columns.map((column, index) =>
        index === 2 ? { ...column, name: 'no"te `x`' } : column,
      ),
    }
    const original = [hostile, ...POSTGRES_ROW.slice(1)]
    const cells = new Map([[2, text(hostile)]])

    const postgres = updateStatement({ ...POSTGRES, table }, { index: 0, original, cells })
    const mysql = updateStatement({ ...MYSQL, table }, { index: 0, original, cells })

    expect(postgres.sql).toBe(
      'UPDATE "we""ird"."ta`ble" SET "no""te `x`" = $1 WHERE "id" = $2 AND "no""te `x`" IS NULL',
    )
    expect(mysql.sql).toBe(
      'UPDATE `we"ird`.`ta``ble` SET `no"te ``x``` = ? WHERE `id` = ? AND `no"te ``x``` IS NULL',
    )
    expect(postgres.values).toStrictEqual([hostile, hostile])
    expect(postgres.label).toBe(`id = ${hostile}`)
  })
})

describe('deleteStatement', () => {
  it('should delete the row where the key is its own and every editable cell still holds what was read', () => {
    expect(deleteStatement(POSTGRES, { index: 2, original: POSTGRES_ROW })).toStrictEqual({
      verb: EditVerb.Delete,
      sql: 'DELETE FROM "sales"."orders" WHERE "id" = $1 AND "code" = $2 AND "note" IS NULL AND "total" = $3 AND CAST("payload" AS text) = $4 AND "placed_at" = $5',
      values: ['1', 'A-1', '12.50', '{"a": 1}', '2026-01-02 03:04:05+00'],
      expectedRows: 1,
      row: { isNew: false, index: 2 },
      label: 'id = 1',
    })
  })

  it('should compare in MySQL as it writes', () => {
    expect(deleteStatement(MYSQL, { index: 0, original: MYSQL_ROW }).sql).toBe(
      'DELETE FROM `shop`.`orders` WHERE `id` = CAST(? AS SIGNED) AND `code` = ? COLLATE utf8mb4_bin AND `note` IS NULL AND `total` = CAST(? AS DECIMAL(10,2)) AND CAST(`payload` AS CHAR) = ? COLLATE utf8mb4_bin AND `placed_at` = ?',
    )
  })

  it('should find the row by every part of a composite key, in key order', () => {
    const table: EditableTable = { ...POSTGRES_ORDERS, key: [1, 0] }

    expect(
      deleteStatement({ ...POSTGRES, table }, { index: 0, original: POSTGRES_ROW }),
    ).toMatchObject({
      sql: 'DELETE FROM "sales"."orders" WHERE "code" = $1 AND "id" = $2 AND "note" IS NULL AND "total" = $3 AND CAST("payload" AS text) = $4 AND "placed_at" = $5',
      label: "code = 'A-1', id = 1",
    })
  })
})

describe('keys', () => {
  it('should compare a key with the equality of its index, not in another collation or type', () => {
    const textKey: EditableTable = { ...MYSQL_ORDERS, key: [1] }
    const serverKey: EditableTable = {
      ...POSTGRES_ORDERS,
      columns: POSTGRES_ORDERS.columns.map((column, index) =>
        index === 0
          ? {
              ...column,
              value: { type: ValueType.Server },
              sql: { ...column.sql, comparedAs: 'text' },
            }
          : column,
      ),
    }
    const cells = new Map([[2, text('x')]])

    expect(
      updateStatement({ ...MYSQL, table: textKey }, { index: 0, original: MYSQL_ROW, cells }).sql,
    ).toBe('UPDATE `shop`.`orders` SET `note` = ? WHERE `code` = ? AND `note` IS NULL')
    expect(
      updateStatement(
        { ...POSTGRES, table: serverKey },
        { index: 0, original: POSTGRES_ROW, cells },
      ).sql,
    ).toBe('UPDATE "sales"."orders" SET "note" = $1 WHERE "id" = $2 AND "note" IS NULL')
  })

  it('should bind the value a column is compared to as text, as text', () => {
    const table: EditableTable = {
      ...MYSQL_ORDERS,
      columns: MYSQL_ORDERS.columns.map((column, index) =>
        index === 4
          ? { ...column, sql: { parameterType: 'JSON', comparedAs: 'CHAR', collation: '' } }
          : column,
      ),
    }

    expect(
      updateStatement(
        { ...MYSQL, table },
        { index: 0, original: MYSQL_ROW, cells: new Map([[4, text('[]')]]) },
      ).sql,
    ).toBe(
      'UPDATE `shop`.`orders` SET `payload` = CAST(? AS JSON) WHERE `id` = CAST(? AS SIGNED) AND CAST(`payload` AS CHAR) = ?',
    )
  })
})

describe('insertStatement', () => {
  it('should name every column once, leaving to the server what the grid did not set', () => {
    const cells = new Map([
      [1, text('B-1')],
      [2, NULL],
      [5, DEFAULT],
    ])

    expect(insertStatement(POSTGRES, { id: 9, position: 2, cells })).toStrictEqual({
      verb: EditVerb.Insert,
      sql: 'INSERT INTO "sales"."orders" ("id", "code", "note", "total", "payload", "placed_at", "total_cents") VALUES (DEFAULT, $1, NULL, DEFAULT, DEFAULT, DEFAULT, DEFAULT)',
      values: ['B-1'],
      expectedRows: 1,
      row: { isNew: true, id: 9 },
      label: 'new row 2',
    })
  })

  it('should cast in MySQL, and name a column shown twice once', () => {
    const [id, code, note, total] = MYSQL_ORDERS.columns
    const columns = [id, code, note, total].filter((column) => column !== undefined)
    const twice = {
      ...columns[3],
      name: 'total',
      value: { type: ValueType.ReadOnly, reason: 'twice' },
    }
    const table = { ...MYSQL_ORDERS, columns: [...columns, twice] } as EditableTable
    const cells = new Map([
      [0, text('5')],
      [3, text('1.50')],
    ])

    expect(insertStatement({ ...MYSQL, table }, { id: 1, position: 1, cells }).sql).toBe(
      'INSERT INTO `shop`.`orders` (`id`, `code`, `note`, `total`) VALUES (CAST(? AS SIGNED), DEFAULT, DEFAULT, CAST(? AS DECIMAL(10,2)))',
    )
  })
})

describe('labels', () => {
  it('should cut long key values and show NULL', () => {
    const long = 'x'.repeat(45)
    const table: EditableTable = { ...POSTGRES_ORDERS, key: [1, 2] }

    expect(
      deleteStatement({ ...POSTGRES, table }, { index: 0, original: [1, long, null] }).label,
    ).toBe(`code = '${'x'.repeat(40)}…', note = NULL`)
    expect(
      deleteStatement({ ...POSTGRES, table }, { index: 0, original: [1, 'x'.repeat(40), null] })
        .label,
    ).toBe(`code = '${'x'.repeat(40)}', note = NULL`)
  })

  it('should refuse a column the result does not have', () => {
    expect(() =>
      updateStatement(POSTGRES, { index: 0, original: POSTGRES_ROW, cells: new Map([[9, NULL]]) }),
    ).toThrow(new RangeError('The result has no column 9'))
  })
})
