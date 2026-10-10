import {
  type TableColumn,
  type ValueSpec,
  type ValueSql,
  ValueType,
} from '../../core/engine/table.ts'

// A column as pg_attribute and pg_type describe it.
export interface PostgresColumn {
  // Its number in the table (attnum), as text.
  readonly reference: string
  readonly name: string
  // The whole type, as format_type writes it: character varying(20), numeric(10,2).
  readonly dataType: string
  // The type's own name (typname), its kind (typtype) and category (typcategory).
  readonly typeName: string
  readonly typeType: string
  readonly category: string
  readonly isNullable: boolean
  readonly hasDefault: boolean
  // 'a' (ALWAYS) or 'd' (BY DEFAULT) for an identity, empty otherwise.
  readonly identity: string
  // 's' (stored) or 'v' (virtual) for a generated column, empty otherwise.
  readonly generated: string
  // The type modifier (atttypmod): lengths, precisions; -1 when there is none.
  readonly modifier: number
  // The values of an enum type, in order.
  readonly labels: readonly string[]
}

interface Written {
  readonly value: ValueSpec
  readonly sql: ValueSql
}

type Describe = (column: PostgresColumn) => Written

const AS_IS: ValueSql = { parameterType: '', comparedAs: '', collation: '' }
// Types sqldoro has no checker for, and JSON (json has no equality), are compared as the text the
// server writes them as: what the grid shows.
const AS_TEXT: ValueSql = { ...AS_IS, comparedAs: 'text' }
const ALWAYS = 'a'
const ENUM = 'e'
const BASE = 'b'
const ARRAY = 'A'
// The header the type modifiers of lengths and numerics include (VARHDRSZ).
const HEADER = 4
const PRECISION_SHIFT = 16
const PRECISION_MASK = 0xff_ff
// The scale takes 11 bits, signed (PostgreSQL 15 and later allow a negative scale).
const SCALE_MASK = 0x7_ff
const SCALE_SIGN = 1024
// Fraction digits of time and timestamp types without a precision of their own.
const DEFAULT_FRACTION = 6
const MAX_HOUR = 23
const YEARS = { minYear: 1, maxYear: 9999 }
const SERVER: Written = { value: { type: ValueType.Server }, sql: AS_TEXT }

const DESCRIBERS: ReadonlyMap<string, Describe> = new Map<string, Describe>([
  ['int2', integer('-32768', '32767')],
  ['int4', integer('-2147483648', '2147483647')],
  ['int8', integer('-9223372036854775808', '9223372036854775807')],
  ['numeric', decimalOf],
  ['float4', fixed({ type: ValueType.Float })],
  ['float8', fixed({ type: ValueType.Float })],
  ['bool', fixed({ type: ValueType.Boolean })],
  ['text', fixed({ type: ValueType.Text, maxLength: 0 })],
  ['varchar', textOf],
  ['bpchar', textOf],
  ['date', fixed({ type: ValueType.Date, ...YEARS })],
  ['time', timeOf(false)],
  ['timetz', timeOf(true)],
  ['timestamp', timestampOf(false)],
  ['timestamptz', timestampOf(true)],
  ['json', () => ({ value: { type: ValueType.Json }, sql: AS_TEXT })],
  ['jsonb', () => ({ value: { type: ValueType.Json }, sql: AS_TEXT })],
  ['uuid', fixed({ type: ValueType.Uuid })],
  ['bytea', fixed({ type: ValueType.ReadOnly, reason: 'Binary values are shown read-only.' })],
])

export function tableColumnOf(column: PostgresColumn): TableColumn {
  const isGenerated = column.generated !== ''
  const { value, sql } = writtenOf(column)
  return {
    name: column.name,
    reference: column.reference,
    dataType: column.dataType,
    isNullable: column.isNullable,
    hasDefault: column.isNullable || column.hasDefault || column.identity !== '' || isGenerated,
    // An identity GENERATED ALWAYS only takes DEFAULT, like a generated column.
    isWritable: !isGenerated && column.identity !== ALWAYS,
    value,
    sql,
  }
}

// Enums list their values; arrays, domains, ranges and composite types are checked by the server.
function writtenOf(column: PostgresColumn): Written {
  if (column.typeType === ENUM) {
    return {
      value: { type: ValueType.Choice, options: column.labels, isMultiple: false },
      sql: AS_IS,
    }
  }
  const isPlainBase = column.typeType === BASE && column.category !== ARRAY
  const describe = isPlainBase ? DESCRIBERS.get(column.typeName) : undefined
  return describe === undefined ? SERVER : describe(column)
}

function fixed(value: ValueSpec): Describe {
  return () => ({ value, sql: AS_IS })
}

function integer(min: string, max: string): Describe {
  return fixed({ type: ValueType.Integer, min, max })
}

// numeric(p,s) stores p and s in its type modifier; numeric alone has no limit.
function decimalOf({ modifier, dataType }: PostgresColumn): Written {
  if (modifier < 0) {
    return { value: { type: ValueType.Decimal, precision: 0, scale: 0 }, sql: AS_IS }
  }
  const packed = modifier - HEADER
  const precision = (packed >> PRECISION_SHIFT) & PRECISION_MASK
  const scale = ((packed & SCALE_MASK) ^ SCALE_SIGN) - SCALE_SIGN
  if (scale < 0 || scale > precision) {
    const reason = `sqldoro does not edit ${dataType} values: their scale is outside their precision.`
    return { value: { type: ValueType.ReadOnly, reason }, sql: AS_IS }
  }
  return { value: { type: ValueType.Decimal, precision, scale }, sql: AS_IS }
}

function textOf({ modifier }: PostgresColumn): Written {
  return {
    value: { type: ValueType.Text, maxLength: modifier > HEADER ? modifier - HEADER : 0 },
    sql: AS_IS,
  }
}

function fractionOf(modifier: number): number {
  return modifier < 0 ? DEFAULT_FRACTION : modifier
}

function timeOf(hasTimeZone: boolean): Describe {
  return ({ modifier }) => ({
    value: { type: ValueType.Time, fraction: fractionOf(modifier), maxHour: MAX_HOUR, hasTimeZone },
    sql: AS_IS,
  })
}

function timestampOf(hasTimeZone: boolean): Describe {
  return ({ modifier }) => ({
    value: { type: ValueType.Timestamp, fraction: fractionOf(modifier), hasTimeZone, ...YEARS },
    sql: AS_IS,
  })
}
