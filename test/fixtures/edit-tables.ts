// Editable tables as the analysis builds them for each engine, for the tests of the statements the
// grid's changes become.
import type { EditableColumn, EditableTable } from '../../src/core/edits/editability.ts'
import { type ValueSpec, ValueType } from '../../src/core/engine/table.ts'

const PLAIN = { parameterType: '', comparedAs: '', collation: '' }
const INT: ValueSpec = { type: ValueType.Integer, min: '-2147483648', max: '2147483647' }
const TEXT: ValueSpec = { type: ValueType.Text, maxLength: 0 }

function column(name: string, changes: Partial<EditableColumn> = {}): EditableColumn {
  return { name, value: INT, sql: PLAIN, isNullable: false, hasDefault: false, ...changes }
}

// id, code, note, total, payload, placed_at, total_cents (computed).
export const POSTGRES_ORDERS: EditableTable = {
  name: ['sales', 'orders'],
  label: 'sales.orders',
  columns: [
    column('id'),
    column('code', { value: TEXT }),
    column('note', { value: TEXT, isNullable: true, hasDefault: true }),
    column('total', {
      value: { type: ValueType.Decimal, precision: 10, scale: 2 },
      isNullable: true,
      hasDefault: true,
    }),
    column('payload', {
      value: { type: ValueType.Json },
      sql: { ...PLAIN, comparedAs: 'text' },
      isNullable: true,
      hasDefault: true,
    }),
    column('placed_at', {
      value: {
        type: ValueType.Timestamp,
        fraction: 6,
        hasTimeZone: true,
        minYear: 1,
        maxYear: 9999,
      },
      hasDefault: true,
    }),
    column('total_cents', {
      value: { type: ValueType.ReadOnly, reason: 'The server computes this column.' },
      isNullable: true,
      hasDefault: true,
    }),
  ],
  key: [0],
  insertProblem: '',
}

const EXACT_TEXT = { ...PLAIN, collation: 'utf8mb4_bin' }

export const MYSQL_ORDERS: EditableTable = {
  name: ['shop', 'orders'],
  label: 'shop.orders',
  columns: [
    column('id', { sql: { ...PLAIN, parameterType: 'SIGNED' } }),
    column('code', { value: TEXT, sql: EXACT_TEXT }),
    column('note', { value: TEXT, sql: EXACT_TEXT, isNullable: true, hasDefault: true }),
    column('total', {
      value: { type: ValueType.Decimal, precision: 10, scale: 2 },
      sql: { ...PLAIN, parameterType: 'DECIMAL(10,2)' },
      isNullable: true,
      hasDefault: true,
    }),
    column('payload', {
      value: { type: ValueType.Json },
      sql: { ...EXACT_TEXT, comparedAs: 'CHAR' },
      isNullable: true,
      hasDefault: true,
    }),
    column('placed_at', {
      value: {
        type: ValueType.Timestamp,
        fraction: 0,
        hasTimeZone: false,
        minYear: 1000,
        maxYear: 9999,
      },
      hasDefault: true,
    }),
    column('total_cents', {
      value: { type: ValueType.ReadOnly, reason: 'The server computes this column.' },
      isNullable: true,
      hasDefault: true,
    }),
  ],
  key: [0],
  insertProblem: '',
}

// A row of either table: id 1, code A-1, no note, a total, a payload and a date.
export const POSTGRES_ROW = [1, 'A-1', null, '12.50', '{"a": 1}', '2026-01-02 03:04:05+00', 1250]
export const MYSQL_ROW = [1, 'A-1', null, '12.50', '{"a": 1}', '2026-01-02 03:04:05', 1250]
