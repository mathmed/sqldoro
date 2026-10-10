import type { LexicalRules } from '../sql/lexical-rules.ts'

// How a binary value is written as an SQL literal: X'00ff' in MySQL, '\x00ff' (bytea hex) in
// PostgreSQL.
export const BinaryLiteral = {
  HexString: 'hexString',
  ByteaHex: 'byteaHex',
} as const

export type BinaryLiteral = (typeof BinaryLiteral)[keyof typeof BinaryLiteral]

// How a statement refers to its bound values: ? in MySQL, $1, $2... in PostgreSQL.
export const ParameterStyle = {
  QuestionMark: 'questionMark',
  Numbered: 'numbered',
} as const

export type ParameterStyle = (typeof ParameterStyle)[keyof typeof ParameterStyle]

export interface Dialect {
  readonly identifierQuote: string
  readonly hasSchemas: boolean
  // The schema an editor works in when none is chosen; empty when the dialect has no schemas.
  readonly defaultSchema: string
  readonly lexical: LexicalRules
  // Keywords and functions of the dialect, offered by the autocomplete beside the standard ones.
  readonly keywords: readonly string[]
  readonly binaryLiteral: BinaryLiteral
  readonly parameterStyle: ParameterStyle
  // The type a value is cast to before a text search on the server.
  readonly textType: string
  // What goes before a statement to show its plan, and to run it and measure each step.
  readonly explainPrefix: string
  readonly explainAnalyzePrefix: string
}

const NUL = '\u0000'

export function quoteIdentifier(
  dialect: Pick<Dialect, 'identifierQuote'>,
  identifier: string,
): string {
  if (identifier === '' || identifier.includes(NUL)) {
    throw new RangeError(`Invalid identifier ${JSON.stringify(identifier)}`)
  }
  const quote = dialect.identifierQuote
  const escaped = identifier.replaceAll(quote, quote + quote)
  return `${quote}${escaped}${quote}`
}

export function qualifiedName(
  dialect: Pick<Dialect, 'identifierQuote'>,
  parts: readonly string[],
): string {
  return parts.map((part) => quoteIdentifier(dialect, part)).join('.')
}

// The placeholder of the bound value at `index` (0-based) in a statement.
export function parameterPlaceholder(
  dialect: Pick<Dialect, 'parameterStyle'>,
  index: number,
): string {
  return dialect.parameterStyle === ParameterStyle.Numbered ? `$${String(index + 1)}` : '?'
}
