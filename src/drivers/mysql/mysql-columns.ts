import {
  type TableColumn,
  type ValueSpec,
  type ValueSql,
  ValueType,
} from '../../core/engine/table.ts'

// A column as information_schema.COLUMNS describes it.
export interface MysqlColumn {
  readonly name: string
  // The whole type: int unsigned, decimal(10,2), enum('a','b').
  readonly columnType: string
  // The type alone, in lower case: int, decimal, enum.
  readonly dataType: string
  readonly isNullable: boolean
  readonly hasExplicitDefault: boolean
  // auto_increment, VIRTUAL GENERATED, STORED GENERATED, DEFAULT_GENERATED...
  readonly extra: string
  readonly maxLength: number | undefined
  readonly precision: number | undefined
  readonly scale: number | undefined
  readonly fraction: number | undefined
}

interface Written {
  readonly value: ValueSpec
  readonly sql: ValueSql
}

type Describe = (column: MysqlColumn) => Written

const AS_IS: ValueSql = { parameterType: '', comparedAs: '', collation: '' }
// Text is compared byte for byte, so that a change of case or accents counts as a change.
const EXACT_TEXT: ValueSql = { ...AS_IS, collation: 'utf8mb4_bin' }
const UNSIGNED = 'unsigned'
// MySQL types the parameter of CAST(? AS UNSIGNED) as a signed BIGINT when it prepares the
// statement, which cuts values above 9223372036854775807: DECIMAL(20,0) holds every unsigned
// integer exactly.
const UNSIGNED_PARAMETER = 'DECIMAL(20,0)'
const SIGNED_PARAMETER = 'SIGNED'
const FIRST_YEAR = 1000
const LAST_YEAR = 9999
// TIMESTAMP holds 1970-01-01 00:00:01 to 2038-01-19 03:14:07 UTC.
const TIMESTAMP_YEARS = { minYear: 1970, maxYear: 2038 }
const DATE_YEARS = { minYear: FIRST_YEAR, maxYear: LAST_YEAR }
// TIME holds durations from -838:59:59 to 838:59:59.
const MAX_TIME_HOUR = 838
const GENERATED: readonly string[] = ['virtual generated', 'stored generated']
const AUTO_INCREMENT = 'auto_increment'
const BINARY = 'Binary values are shown read-only.'
const SPATIAL = 'Spatial values are shown read-only.'
// The smallest signed value, the largest signed value and the largest unsigned value.
const INTEGER_RANGES: ReadonlyMap<string, readonly [string, string, string]> = new Map([
  ['tinyint', ['-128', '127', '255']],
  ['smallint', ['-32768', '32767', '65535']],
  ['mediumint', ['-8388608', '8388607', '16777215']],
  ['int', ['-2147483648', '2147483647', '4294967295']],
  ['bigint', ['-9223372036854775808', '9223372036854775807', '18446744073709551615']],
] as const)
// enum('a','it''s','a\\b'): the values between quotes, where the server doubles quotes and writes
// backslashes, line breaks and NUL as escapes.
const QUOTED_VALUE = /'((?:[^'\\]|''|\\.)*)'/gs
const ESCAPED = /''|\\(.)/gs
const ESCAPES: ReadonlyMap<string, string> = new Map([
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t'],
  ['0', '\0'],
  ['Z', '\u001A'],
])

const DESCRIBERS: ReadonlyMap<string, Describe> = new Map<string, Describe>([
  ...[...INTEGER_RANGES].map(([type, range]) => [type, integerOf(range)] as const),
  ['decimal', decimalOf],
  ['float', floatOf('FLOAT')],
  ['double', floatOf('DOUBLE')],
  ...['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext'].map(
    (type) => [type, textOf] as const,
  ),
  ['enum', choiceOf(false)],
  ['set', choiceOf(true)],
  ['date', () => ({ value: { type: ValueType.Date, ...DATE_YEARS }, sql: AS_IS })],
  ['datetime', timestampOf(DATE_YEARS)],
  ['timestamp', timestampOf(TIMESTAMP_YEARS)],
  ['time', timeOf],
  ['year', () => ({ value: { type: ValueType.Year }, sql: AS_IS })],
  ['json', () => ({ value: { type: ValueType.Json }, sql: { ...EXACT_TEXT, comparedAs: 'CHAR' } })],
  ...['binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob', 'bit'].map(
    (type) => [type, readOnly(BINARY)] as const,
  ),
  ...[
    'geometry',
    'point',
    'linestring',
    'polygon',
    'multipoint',
    'multilinestring',
    'multipolygon',
    'geomcollection',
    'geometrycollection',
  ].map((type) => [type, readOnly(SPATIAL)] as const),
])

export function tableColumnOf(column: MysqlColumn): TableColumn {
  const extra = column.extra.toLowerCase()
  const isGenerated = GENERATED.some((kind) => extra.includes(kind))
  const { value, sql } = writtenOf(column)
  return {
    name: column.name,
    reference: column.name,
    dataType: column.columnType,
    isNullable: column.isNullable,
    hasDefault:
      column.isNullable ||
      column.hasExplicitDefault ||
      isGenerated ||
      extra.includes(AUTO_INCREMENT),
    isWritable: !isGenerated,
    value,
    sql,
  }
}

function writtenOf(column: MysqlColumn): Written {
  const describe = DESCRIBERS.get(column.dataType.toLowerCase())
  return describe === undefined
    ? readOnly(`sqldoro does not edit ${column.dataType} values.`)(column)
    : describe(column)
}

function integerOf([min, max, maxUnsigned]: readonly [string, string, string]): Describe {
  return (column) => {
    const isUnsigned = column.columnType.toLowerCase().includes(UNSIGNED)
    return {
      value: isUnsigned
        ? { type: ValueType.Integer, min: '0', max: maxUnsigned }
        : { type: ValueType.Integer, min, max },
      sql: { ...AS_IS, parameterType: isUnsigned ? UNSIGNED_PARAMETER : SIGNED_PARAMETER },
    }
  }
}

function decimalOf(column: MysqlColumn): Written {
  const precision = column.precision ?? 0
  const scale = column.scale ?? 0
  return {
    value: { type: ValueType.Decimal, precision, scale },
    sql: { ...AS_IS, parameterType: `DECIMAL(${String(precision)},${String(scale)})` },
  }
}

function floatOf(parameterType: string): Describe {
  return () => ({ value: { type: ValueType.Float }, sql: { ...AS_IS, parameterType } })
}

function textOf(column: MysqlColumn): Written {
  return { value: { type: ValueType.Text, maxLength: column.maxLength ?? 0 }, sql: EXACT_TEXT }
}

function choiceOf(isMultiple: boolean): Describe {
  return (column) => ({
    value: { type: ValueType.Choice, options: choicesOf(column.columnType), isMultiple },
    sql: EXACT_TEXT,
  })
}

export function choicesOf(columnType: string): string[] {
  return [...columnType.matchAll(QUOTED_VALUE)].map(([, inner = '']) =>
    inner.replaceAll(ESCAPED, (...[, escaped = "'"]: string[]) => ESCAPES.get(escaped) ?? escaped),
  )
}

function timestampOf(years: typeof DATE_YEARS): Describe {
  return (column) => ({
    value: {
      type: ValueType.Timestamp,
      fraction: column.fraction ?? 0,
      hasTimeZone: false,
      ...years,
    },
    sql: AS_IS,
  })
}

function timeOf(column: MysqlColumn): Written {
  return {
    value: {
      type: ValueType.Time,
      fraction: column.fraction ?? 0,
      maxHour: MAX_TIME_HOUR,
      hasTimeZone: false,
    },
    sql: AS_IS,
  }
}

function readOnly(reason: string): Describe {
  return () => ({ value: { type: ValueType.ReadOnly, reason }, sql: AS_IS })
}
