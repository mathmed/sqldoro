import { type Dialect, qualifiedName } from '../engine/dialect.ts'
import { type CellValue, ColumnKind, type ResultColumn, type Row } from '../engine/query.ts'
import { isPlainNumber, type LiteralDialect, sqlLiteral } from './literals.ts'

export const ExportFormat = {
  Csv: 'csv',
  Tsv: 'tsv',
  Json: 'json',
  Sql: 'sql',
} as const

export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat]

const EXPORT_FORMATS: ReadonlySet<string> = new Set(Object.values(ExportFormat))

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && EXPORT_FORMATS.has(value)
}

export interface FormatTarget {
  readonly columns: readonly ResultColumn[]
  // The table INSERT statements write to.
  readonly table: readonly string[]
  readonly dialect: LiteralDialect & Pick<Dialect, 'identifierQuote'>
}

// Writes rows one at a time, so that an export streams to its file instead of being built in
// memory. `index` is the position of the row in what is written.
export interface RowFormatter {
  readonly header: string
  readonly row: (row: Row, index: number) => string
  readonly footer: string
}

const CRLF = '\r\n'
const NEEDS_QUOTES = /[",\r\n]/
const TSV_NEEDS_QUOTES = /["\t\r\n]/
const QUOTE = '"'
const JSON_INDENT = '  '
const FIRST_DUPLICATE = 2

export function rowFormatter(format: ExportFormat, target: FormatTarget): RowFormatter {
  switch (format) {
    case ExportFormat.Csv:
      return csvFormatter(target)
    case ExportFormat.Tsv:
      return tsvFormatter()
    case ExportFormat.Json:
      return jsonFormatter(target)
    case ExportFormat.Sql:
      return sqlFormatter(target)
  }
}

export function formatRows(rows: readonly Row[], formatter: RowFormatter): string {
  return `${formatter.header}${rows.map(formatter.row).join('')}${formatter.footer}`
}

function quoted(text: string): string {
  return `${QUOTE}${text.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`
}

// RFC 4180. NULL is an empty field and an empty string a quoted one, so the two stay apart.
function csvField(value: CellValue): string {
  if (value === null) {
    return ''
  }
  const text = String(value)
  return text === '' || NEEDS_QUOTES.test(text) ? quoted(text) : text
}

function csvFormatter({ columns }: FormatTarget): RowFormatter {
  return {
    header: `${columns.map((column) => csvField(column.name)).join(',')}${CRLF}`,
    row: (row) => `${row.map(csvField).join(',')}${CRLF}`,
    footer: '',
  }
}

// Values only, ready to paste in a spreadsheet; NULL is an empty cell.
function tsvFormatter(): RowFormatter {
  const field = (value: CellValue): string => {
    const text = value === null ? '' : String(value)
    return TSV_NEEDS_QUOTES.test(text) ? quoted(text) : text
  }
  return { header: '', row: (row) => `${row.map(field).join('\t')}${CRLF}`, footer: '' }
}

interface JsonField {
  readonly key: string
  readonly kind: ColumnKind
}

// Two columns with the same name get distinct keys: id, id (2).
function jsonFields(columns: readonly ResultColumn[]): JsonField[] {
  const taken = new Set<string>()
  return columns.map(({ name, kind }) => {
    let key = name
    let suffix = FIRST_DUPLICATE
    while (taken.has(key)) {
      key = `${name} (${String(suffix)})`
      suffix += 1
    }
    taken.add(key)
    return { key: JSON.stringify(key), kind }
  })
}

function jsonValue(value: CellValue, kind: ColumnKind): string {
  if (typeof value === 'string' && isRawJson(value, kind)) {
    return value
  }
  return JSON.stringify(
    typeof value === 'number' && !Number.isFinite(value) ? String(value) : value,
  )
}

// Exact numbers stay numbers with every digit, and JSON columns stay JSON.
function isRawJson(text: string, kind: ColumnKind): boolean {
  if (kind === ColumnKind.Number) {
    return isPlainNumber(text) && !/^-?0\d/.test(text)
  }
  return kind === ColumnKind.Json && isJson(text)
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch (error) {
    if (error instanceof SyntaxError) {
      return false
    }
    throw error
  }
}

function jsonFormatter({ columns }: FormatTarget): RowFormatter {
  const fields = jsonFields(columns)
  const objectOf = (row: Row): string =>
    fields
      .map((field, index) => `${field.key}: ${jsonValue(row.at(index) ?? null, field.kind)}`)
      .join(', ')
  return {
    header: '[\n',
    row: (row, index) => `${index === 0 ? '' : ',\n'}${JSON_INDENT}{${objectOf(row)}}`,
    footer: '\n]\n',
  }
}

function sqlFormatter({ columns, table, dialect }: FormatTarget): RowFormatter {
  const names = columns.map((column) => qualifiedName(dialect, [column.name])).join(', ')
  const prefix = `INSERT INTO ${qualifiedName(dialect, table)} (${names}) VALUES (`
  return {
    header: '',
    row: (row) => {
      const values = columns.map((column, index) =>
        sqlLiteral(row.at(index) ?? null, column.kind, dialect),
      )
      return `${prefix}${values.join(', ')});\n`
    },
    footer: '',
  }
}
