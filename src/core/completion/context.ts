import type { LexicalRules } from '../sql/lexical-rules.ts'
import { splitStatements } from '../sql/statements.ts'
import { tokenize } from '../sql/tokenizer.ts'
import {
  identifierName,
  isIdentifier,
  isKeyword,
  isText,
  isTrivia,
  type Token,
  tokenAt,
  TokenKind,
} from '../sql/tokens.ts'
import { isSymbol, type TableReference, tableReferences } from './references.ts'

// What the cursor is in: where table names go, where column names go, or anywhere else.
export const Clause = {
  Table: 'table',
  Column: 'column',
  Other: 'other',
} as const

export type Clause = (typeof Clause)[keyof typeof Clause]

export interface CompletionContext {
  // In a string or a comment nothing is offered.
  readonly isInText: boolean
  // The part of the name typed before the cursor, without its opening quote.
  readonly prefix: string
  // Where the typed name starts in the statement (its opening quote included): the completion
  // replaces the text from here to the cursor.
  readonly prefixStart: number
  readonly isQuoted: boolean
  // The names before the dots: ["o"] in "o.na", ["sales", "orders"] in "sales.orders.".
  readonly qualifier: readonly string[]
  readonly clause: Clause
  readonly references: readonly TableReference[]
}

interface Typed {
  readonly prefix: string
  readonly prefixStart: number
  readonly isQuoted: boolean
  // The end of the name the cursor is in, or the cursor.
  readonly end: number
}

interface Qualifier {
  readonly names: readonly string[]
  readonly start: number
}

type Step = { readonly clause: Clause } | { readonly depth: number }

const TABLE_CLAUSES = ['FROM', 'JOIN', 'UPDATE', 'INTO', 'TABLE']
const COLUMN_CLAUSES = [
  'AND',
  'BY',
  'CASE',
  'DISTINCT',
  'ELSE',
  'HAVING',
  'NOT',
  'ON',
  'OR',
  'RETURNING',
  'SELECT',
  'SET',
  'THEN',
  'USING',
  'WHEN',
  'WHERE',
]
const SUBQUERY_OPENERS = ['FROM', 'JOIN']
const OUTSIDE_STATEMENTS: CompletionContext = {
  isInText: false,
  prefix: '',
  prefixStart: 0,
  isQuoted: false,
  qualifier: [],
  clause: Clause.Other,
  references: [],
}
const PART_AND_DOT = 2

// Reads what is being typed at `offset` of a statement, without parsing it: the clause comes from
// the closest keyword before the cursor outside parentheses, the aliases from the rest of the
// statement.
export function analyzeCompletion(
  text: string,
  offset: number,
  rules: LexicalRules,
): CompletionContext {
  const tokens = tokenize(text, rules)
  const current = tokens.find((token) => token.start < offset && offset <= token.end)
  const typed = typedAt(current, offset, text)
  const significant = tokens.filter((token) => !isTrivia(token))
  const before = significant.filter((token) => token.end <= typed.prefixStart)
  const qualifier = readQualifier(before, before.length)
  const typedStart = before.at(qualifier.start)?.start ?? typed.prefixStart
  return {
    isInText: current !== undefined && isInsideText(current, offset),
    prefix: typed.prefix,
    prefixStart: typed.prefixStart,
    isQuoted: typed.isQuoted,
    qualifier: qualifier.names,
    clause: clauseBefore(before, qualifier.start),
    references: tableReferences(outside(significant, typedStart, typed.end)),
  }
}

// The name being typed is not a table of the statement yet.
function outside(tokens: readonly Token[], start: number, end: number): Token[] {
  return tokens.filter((token) => token.end <= start || token.start >= end)
}

// A line comment has no closer: typing at its end still writes the comment.
function isInsideText(token: Token, offset: number): boolean {
  return (
    isText(token) && (offset < token.end || token.isOpen || token.kind === TokenKind.LineComment)
  )
}

function typedAt(current: Token | undefined, offset: number, text: string): Typed {
  if (!isTypingName(current, offset)) {
    return { prefix: '', prefixStart: offset, isQuoted: false, end: offset }
  }
  const typed = text.slice(current.start, offset)
  const isQuoted = current.kind === TokenKind.QuotedIdentifier
  const prefix = isQuoted ? unquote(typed) : typed
  return { prefix, prefixStart: current.start, isQuoted, end: current.end }
}

// Right after the closing quote of a name, the name is finished.
function isTypingName(current: Token | undefined, offset: number): current is Token {
  if (!isIdentifier(current)) {
    return false
  }
  return current.kind === TokenKind.Word || current.isOpen || offset < current.end
}

function unquote(typed: string): string {
  const quote = typed.charAt(0)
  return typed.slice(1).replaceAll(quote + quote, quote)
}

// Each name touches its dot: "SELECT ." has no qualifier.
function readQualifier(tokens: readonly Token[], end: number): Qualifier {
  const dot = tokenAt(tokens, end - 1)
  const name = tokenAt(tokens, end - PART_AND_DOT)
  if (!isSymbol(dot, '.') || !isIdentifier(name) || name.end !== dot.start) {
    return { names: [], start: end }
  }
  const outer = readQualifier(tokens, end - PART_AND_DOT)
  return { names: [...outer.names, identifierName(name)], start: outer.start }
}

function clauseBefore(tokens: readonly Token[], end: number): Clause {
  let depth = 0
  for (let index = end - 1; index >= 0; index -= 1) {
    const step = stepBack(tokens.at(index), tokenAt(tokens, index - 1), depth)
    if ('clause' in step) {
      return step.clause
    }
    depth = step.depth
  }
  return Clause.Other
}

// Walking back, a closing parenthesis hides what is inside it; an opening one at the outer level
// means the cursor is in a list: of columns, or a subquery after FROM and JOIN.
function stepBack(token: Token | undefined, previous: Token | undefined, depth: number): Step {
  if (isSymbol(token, ')')) {
    return { depth: depth + 1 }
  }
  if (isSymbol(token, '(')) {
    return depth === 0 ? { clause: listClause(previous) } : { depth: depth - 1 }
  }
  return depth === 0 ? keywordStep(token) : { depth }
}

function listClause(previous: Token | undefined): Clause {
  return isKeyword(previous, ...SUBQUERY_OPENERS) ? Clause.Other : Clause.Column
}

function keywordStep(token: Token | undefined): Step {
  if (isKeyword(token, ...TABLE_CLAUSES)) {
    return { clause: Clause.Table }
  }
  return isKeyword(token, ...COLUMN_CLAUSES) ? { clause: Clause.Column } : { depth: 0 }
}

// The completion context at `offset` of a script: the statement around the cursor is read up to
// the cursor at least; outside any statement, only keywords make sense.
export function completionAt(
  text: string,
  offset: number,
  rules: LexicalRules,
): { readonly context: CompletionContext; readonly base: number } {
  const statement = splitStatements(text, rules).find(
    (candidate) => candidate.start <= offset && offset <= candidate.terminatorEnd,
  )
  if (statement === undefined) {
    return { context: OUTSIDE_STATEMENTS, base: offset }
  }
  const end = Math.max(offset, statement.end)
  return {
    context: analyzeCompletion(text.slice(statement.start, end), offset - statement.start, rules),
    base: statement.start,
  }
}
