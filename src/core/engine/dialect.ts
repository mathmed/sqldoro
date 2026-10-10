export interface Dialect {
  readonly identifierQuote: string
  readonly hasSchemas: boolean
}

const NUL = '\u0000'

export function quoteIdentifier(dialect: Dialect, identifier: string): string {
  if (identifier === '' || identifier.includes(NUL)) {
    throw new RangeError(`Invalid identifier ${JSON.stringify(identifier)}`)
  }
  const quote = dialect.identifierQuote
  const escaped = identifier.replaceAll(quote, quote + quote)
  return `${quote}${escaped}${quote}`
}

export function qualifiedName(dialect: Dialect, parts: readonly string[]): string {
  return parts.map((part) => quoteIdentifier(dialect, part)).join('.')
}
