import { type Dialect, quoteIdentifier } from '../engine/dialect.ts'
import { stringLiteral } from '../results/literals.ts'
import { tokenize } from '../sql/tokenizer.ts'
import { identifierName, isIdentifier, isTrivia, type Token, TokenKind } from '../sql/tokens.ts'
import { needsQuoting } from './suggestions.ts'

export const WhereSuggestionKind = {
  Column: 'column',
  Keyword: 'keyword',
  Operator: 'operator',
  Value: 'value',
} as const

export type WhereSuggestionKind = (typeof WhereSuggestionKind)[keyof typeof WhereSuggestionKind]

export interface WhereSuggestion {
  readonly label: string
  readonly kind: WhereSuggestionKind
  // What replaces the text being typed.
  readonly insertText: string
}

// What to offer at the cursor, and the part of the text it replaces.
export interface WhereCompletion {
  readonly from: number
  readonly to: number
  readonly suggestions: readonly WhereSuggestion[]
}

// What the WHERE of a table panel knows: the columns of the table, the values of its enum columns,
// and the keywords of the dialect.
export interface WhereSource {
  readonly columns: readonly string[]
  readonly choices: ReadonlyMap<string, readonly string[]>
  readonly keywords: readonly string[]
  readonly dialect: Pick<Dialect, 'identifierQuote' | 'lexical'>
}

interface Typing {
  // The token being typed, if the cursor is at the end of one, and where it starts.
  readonly token: Token | undefined
  readonly from: number
  // The code before it, without whitespace and comments.
  readonly before: readonly Token[]
}

const MAX_SUGGESTIONS = 50
// What a condition is made of, beside the columns.
export const WHERE_KEYWORDS: readonly string[] = [
  'AND',
  'OR',
  'NOT',
  'IS',
  'NULL',
  'IN',
  'LIKE',
  'BETWEEN',
  'EXISTS',
  'TRUE',
  'FALSE',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
]
const OPERATORS: readonly string[] = [
  '=',
  '<>',
  '<',
  '<=',
  '>',
  '>=',
  'LIKE',
  'NOT LIKE',
  'IN ()',
  'BETWEEN',
  'IS NULL',
  'IS NOT NULL',
]
// After a column and one of these, a value comes.
const COMPARISONS: ReadonlySet<string> = new Set(['=', '!', '<', '>', 'LIKE', 'IN', '(', ','])
const VALUE_KINDS: ReadonlySet<TokenKind> = new Set([TokenKind.String, TokenKind.Number])
const ENDS_TYPING: ReadonlySet<TokenKind> = new Set([TokenKind.Whitespace, TokenKind.Symbol])

// The suggestions at the cursor of a condition: the values of an enum column after it is compared,
// the operators after a column, otherwise the columns and the keywords. Nothing inside a comment, a
// quoted name or a number.
export function whereCompletion(
  text: string,
  cursor: number,
  source: WhereSource,
): WhereCompletion | undefined {
  const typing = typingAt(text.slice(0, cursor), source)
  if (typing.token !== undefined && !isCompletable(typing.token)) {
    return undefined
  }
  const prefix = prefixOf(typing.token)
  const suggestions = suggestionsFor(typing, source).filter((suggestion) =>
    matches(suggestion, prefix),
  )
  return { from: typing.from, to: cursor, suggestions: suggestions.slice(0, MAX_SUGGESTIONS) }
}

function typingAt(text: string, source: WhereSource): Typing {
  const tokens = tokenize(text, source.dialect.lexical)
  const last = tokens.at(-1)
  // Whitespace and symbols end what was typed: what comes next starts after them.
  if (last === undefined || ENDS_TYPING.has(last.kind)) {
    return { token: undefined, from: text.length, before: codeOf(tokens) }
  }
  return { token: last, from: last.start, before: codeOf(tokens.slice(0, -1)) }
}

function codeOf(tokens: readonly Token[]): Token[] {
  return tokens.filter((part) => !isTrivia(part))
}

// A word, or a string being typed (for the values of an enum).
function isCompletable(typed: Token): boolean {
  return typed.kind === TokenKind.Word || (typed.kind === TokenKind.String && typed.isOpen)
}

function prefixOf(typed: Token | undefined): string {
  if (typed === undefined) {
    return ''
  }
  return typed.kind === TokenKind.String ? typed.text.slice(1) : typed.text
}

function suggestionsFor(typing: Typing, source: WhereSource): WhereSuggestion[] {
  const choices = choicesAt(typing.before, source)
  if (choices.length > 0) {
    return valueSuggestions(choices, source)
  }
  if (typing.token?.kind === TokenKind.String) {
    return []
  }
  return isColumn(typing.before.at(-1), source) ? operatorSuggestions() : nameSuggestions(source)
}

// The values of the enum column a value is being typed for; none for another column.
function choicesAt(before: readonly Token[], source: WhereSource): readonly string[] {
  const column = comparedColumn(before, source)
  return column === undefined ? [] : (source.choices.get(column) ?? [])
}

// The column a value is being typed for, right after it is compared: "status = ",
// "status IN ('a', ".
function comparedColumn(before: readonly Token[], source: WhereSource): string | undefined {
  if (!isComparison(before.at(-1))) {
    return undefined
  }
  const start = before.findLastIndex((token) => !isValuePart(token))
  // Before any name, at(-1) is the comparison itself: no column.
  const column = before.at(start)
  return isIdentifier(column) ? columnOf(column, source) : undefined
}

function isComparison(token: Token | undefined): boolean {
  return token !== undefined && COMPARISONS.has(token.text.toUpperCase())
}

function isValuePart(token: Token): boolean {
  return VALUE_KINDS.has(token.kind) || isComparison(token)
}

function isColumn(token: Token | undefined, source: WhereSource): boolean {
  return isIdentifier(token) && columnOf(token, source) !== undefined
}

function columnOf(token: Token, source: WhereSource): string | undefined {
  const name = identifierName(token).toLowerCase()
  return source.columns.find((column) => column.toLowerCase() === name)
}

function valueSuggestions(choices: readonly string[], source: WhereSource): WhereSuggestion[] {
  return choices.map((value) => ({
    label: value,
    kind: WhereSuggestionKind.Value,
    insertText: stringLiteral(value, source.dialect),
  }))
}

function operatorSuggestions(): WhereSuggestion[] {
  return OPERATORS.map((operator) => ({
    label: operator,
    kind: WhereSuggestionKind.Operator,
    insertText: operator === 'IN ()' ? 'IN (' : operator,
  }))
}

function nameSuggestions(source: WhereSource): WhereSuggestion[] {
  const columns = source.columns.map((column) => ({
    label: column,
    kind: WhereSuggestionKind.Column,
    insertText: needsQuoting(column, source.dialect)
      ? quoteIdentifier(source.dialect, column)
      : column,
  }))
  const keywords = [...new Set([...WHERE_KEYWORDS, ...source.keywords])].map((keyword) => ({
    label: keyword,
    kind: WhereSuggestionKind.Keyword,
    insertText: keyword,
  }))
  return [...columns, ...keywords]
}

// What was typed starts the suggestion, without case; an empty prefix takes them all.
function matches(suggestion: WhereSuggestion, prefix: string): boolean {
  return suggestion.label.toLowerCase().startsWith(prefix.toLowerCase())
}
