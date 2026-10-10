export const TokenKind = {
  Whitespace: 'whitespace',
  LineComment: 'lineComment',
  BlockComment: 'blockComment',
  // MySQL's /*! ... */: a comment that the server runs as code.
  ExecutableComment: 'executableComment',
  String: 'string',
  QuotedIdentifier: 'quotedIdentifier',
  Word: 'word',
  Number: 'number',
  Parameter: 'parameter',
  Semicolon: 'semicolon',
  Symbol: 'symbol',
} as const

export type TokenKind = (typeof TokenKind)[keyof typeof TokenKind]

export interface Token {
  readonly kind: TokenKind
  readonly start: number
  readonly end: number
  readonly text: string
  // A string, quoted identifier or comment that reaches the end of the text without its closer.
  readonly isOpen: boolean
}

const TRIVIA: ReadonlySet<TokenKind> = new Set([
  TokenKind.Whitespace,
  TokenKind.LineComment,
  TokenKind.BlockComment,
])

const TEXT_KINDS: ReadonlySet<TokenKind> = new Set([
  TokenKind.LineComment,
  TokenKind.BlockComment,
  TokenKind.String,
])

// Whitespace and comments: what the server ignores between two tokens.
export function isTrivia(token: Token): boolean {
  return TRIVIA.has(token.kind)
}

// Strings and comments, where nothing typed is SQL.
export function isText(token: Token): boolean {
  return TEXT_KINDS.has(token.kind)
}

export function isKeyword(token: Token | undefined, ...keywords: readonly string[]): boolean {
  return token?.kind === TokenKind.Word && keywords.includes(token.text.toUpperCase())
}

// The text of an identifier without its quotes: "Order ""A""" is Order "A".
export function identifierName(token: Token): string {
  if (token.kind !== TokenKind.QuotedIdentifier) {
    return token.text
  }
  const quote = token.text.charAt(0)
  const inner = token.isOpen ? token.text.slice(1) : token.text.slice(1, -1)
  return inner.replaceAll(quote + quote, quote)
}

export function isIdentifier(token: Token | undefined): token is Token {
  return token?.kind === TokenKind.Word || token?.kind === TokenKind.QuotedIdentifier
}

// The token at an index of a list, where negative indexes are before the first token.
export function tokenAt(tokens: readonly Token[], index: number): Token | undefined {
  return index < 0 ? undefined : tokens.at(index)
}
