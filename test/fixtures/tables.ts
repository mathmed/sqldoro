// Tables as the drivers describe them for editing, and result columns that come from them, for the
// tests of the core and of the extension host.
import { ColumnKind, type ResultColumn } from '../../src/core/engine/query.ts'
import {
  RelationKind,
  type TableColumn,
  type TableDescription,
  type ValueSpec,
  ValueType,
} from '../../src/core/engine/table.ts'

export const ORDERS_TABLE = ['16510']

const PLAIN = { parameterType: '', comparedAs: '', collation: '' }
const INT4: ValueSpec = { type: ValueType.Integer, min: '-2147483648', max: '2147483647' }

export function tableColumn(name: string, changes: Partial<TableColumn> = {}): TableColumn {
  return {
    name,
    reference: name,
    dataType: 'integer',
    isNullable: false,
    hasDefault: false,
    isWritable: true,
    value: INT4,
    sql: PLAIN,
    ...changes,
  }
}

// sales.orders: id (primary key), code (unique, not null), note, total, payload (JSON), placed_at
// (with a time zone, defaulted) and total_cents (computed by the server).
const ORDERS_COLUMNS: readonly TableColumn[] = [
  tableColumn('id'),
  tableColumn('code', { dataType: 'text', value: { type: ValueType.Text, maxLength: 0 } }),
  tableColumn('note', {
    dataType: 'character varying(20)',
    isNullable: true,
    hasDefault: true,
    value: { type: ValueType.Text, maxLength: 20 },
  }),
  tableColumn('total', {
    dataType: 'numeric(10,2)',
    isNullable: true,
    hasDefault: true,
    value: { type: ValueType.Decimal, precision: 10, scale: 2 },
  }),
  tableColumn('payload', {
    dataType: 'jsonb',
    isNullable: true,
    hasDefault: true,
    value: { type: ValueType.Json },
    sql: { ...PLAIN, comparedAs: 'text' },
  }),
  tableColumn('placed_at', {
    dataType: 'timestamp with time zone',
    hasDefault: true,
    value: {
      type: ValueType.Timestamp,
      fraction: 6,
      hasTimeZone: true,
      minYear: 1,
      maxYear: 9999,
    },
  }),
  tableColumn('total_cents', { isNullable: true, hasDefault: true, isWritable: false }),
]

export const ORDERS: TableDescription = {
  ref: { database: 'shop', schema: 'sales', name: 'orders' },
  kind: RelationKind.Table,
  problem: '',
  columns: ORDERS_COLUMNS,
  keys: [['id'], ['code']],
}

// A result column that shows a column of sales.orders.
export function ordersColumn(name: string, column = name): ResultColumn {
  return {
    name,
    dataType: 'INT4',
    kind: ColumnKind.Number,
    origin: { table: ORDERS_TABLE, column },
  }
}

export const ORDERS_RESULT: readonly ResultColumn[] = ORDERS_COLUMNS.map((column) =>
  ordersColumn(column.name),
)
