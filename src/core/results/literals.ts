import { BinaryLiteral, type Dialect } from '../engine/dialect.ts'
import { type CellValue, ColumnKind } from '../engine/query.ts'

export type LiteralDialect = Pick<Dialect, 'binaryLiteral' | 'lexical'>

const HEX_VALUE = /^0x[\da-f]*$/i
const HEX_PREFIX_LENGTH = 2
const NUMBER_PART = /^\d+$/
const INTEGER_PART = /^-?\d+$/
const MAX_NUMBER_PARTS = 2
const QUOTE = "'"
const BACKSLASH = '\\'

// Digits with an optional sign and fraction: the form exact numbers come back from the server in.
export function isPlainNumber(text: string): boolean {
  const parts = text.split('.')
  const [whole = '', fraction] = parts
  return (
    parts.length <= MAX_NUMBER_PARTS &&
    INTEGER_PART.test(whole) &&
    (fraction === undefined || NUMBER_PART.test(fraction))
  )
}

export function stringLiteral(text: string, dialect: Pick<Dialect, 'lexical'>): string {
  const escaped = dialect.lexical.hasBackslashEscapes
    ? text.replaceAll(BACKSLASH, BACKSLASH + BACKSLASH)
    : text
  return `${QUOTE}${escaped.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`
}

// The SQL literal that writes a cell back as the server sent it: exact numbers unquoted, binary
// values in the dialect's hexadecimal form, everything else as a string.
export function sqlLiteral(value: CellValue, kind: ColumnKind, dialect: LiteralDialect): string {
  if (value === null) {
    return 'NULL'
  }
  if (typeof value === 'string') {
    return textLiteral(value, kind, dialect)
  }
  return typeof value === 'boolean' ? booleanLiteral(value) : numberLiteral(value, dialect)
}

function booleanLiteral(isTrue: boolean): string {
  return isTrue ? 'TRUE' : 'FALSE'
}

// NaN and Infinity have no literal: PostgreSQL reads them from strings.
function numberLiteral(value: number, dialect: LiteralDialect): string {
  return Number.isFinite(value) ? String(value) : stringLiteral(String(value), dialect)
}

function textLiteral(text: string, kind: ColumnKind, dialect: LiteralDialect): string {
  if (kind === ColumnKind.Number && isPlainNumber(text)) {
    return text
  }
  if (kind === ColumnKind.Binary && HEX_VALUE.test(text)) {
    return binaryLiteral(text.slice(HEX_PREFIX_LENGTH), dialect)
  }
  return stringLiteral(text, dialect)
}

function binaryLiteral(hex: string, dialect: LiteralDialect): string {
  return dialect.binaryLiteral === BinaryLiteral.HexString
    ? `X'${hex}'`
    : stringLiteral(`\\x${hex}`, dialect)
}
