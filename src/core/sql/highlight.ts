import type { LexicalRules } from './lexical-rules.ts'
import { tokenize } from './tokenizer.ts'
import { TokenKind } from './tokens.ts'

// What a part of SQL is, for its color: the theme gives each its own.
export const HighlightKind = {
  Keyword: 'keyword',
  String: 'string',
  Number: 'number',
  Identifier: 'identifier',
  Operator: 'operator',
  Comment: 'comment',
  Plain: 'plain',
} as const

export type HighlightKind = (typeof HighlightKind)[keyof typeof HighlightKind]

export interface HighlightSpan {
  readonly text: string
  readonly kind: HighlightKind
}

// Whitespace, and anything else, stays plain.
const KINDS: ReadonlyMap<TokenKind, HighlightKind> = new Map([
  [TokenKind.LineComment, HighlightKind.Comment],
  [TokenKind.BlockComment, HighlightKind.Comment],
  [TokenKind.ExecutableComment, HighlightKind.Comment],
  [TokenKind.String, HighlightKind.String],
  [TokenKind.QuotedIdentifier, HighlightKind.Identifier],
  [TokenKind.Number, HighlightKind.Number],
  [TokenKind.Parameter, HighlightKind.Operator],
  [TokenKind.Semicolon, HighlightKind.Operator],
  [TokenKind.Symbol, HighlightKind.Operator],
])

// The SQL cut into the parts its colors change at, every character in one part: the text stays
// exactly as typed. Words are keywords when the set holds them (in upper case), names otherwise.
export function highlightSql(
  text: string,
  rules: LexicalRules,
  keywords: ReadonlySet<string>,
): HighlightSpan[] {
  return tokenize(text, rules).map((token) => ({
    text: token.text,
    kind:
      token.kind === TokenKind.Word
        ? wordKind(token.text, keywords)
        : (KINDS.get(token.kind) ?? HighlightKind.Plain),
  }))
}

function wordKind(word: string, keywords: ReadonlySet<string>): HighlightKind {
  return keywords.has(word.toUpperCase()) ? HighlightKind.Keyword : HighlightKind.Identifier
}
