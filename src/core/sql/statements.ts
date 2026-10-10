import type { LexicalRules } from './lexical-rules.ts'
import { tokenize } from './tokenizer.ts'
import { isTrivia, type Token, TokenKind } from './tokens.ts'

// One statement of a script, without the whitespace and comments around it and without its
// semicolon. Offsets are in the text the script was split from.
export interface StatementSpan {
  readonly text: string
  readonly start: number
  readonly end: number
  // After the semicolon that ends the statement, or the end of the text.
  readonly terminatorEnd: number
}

interface Bounds {
  readonly first: Token | undefined
  readonly last: Token | undefined
  readonly terminatorEnd: number
}

const LINE_BREAK = /[\r\n]/
const BLANK_LINE = /\n[^\S\n]*\r?\n/

// Semicolons inside strings, quoted identifiers, comments and dollar-quoted bodies do not end a
// statement. Statements made only of whitespace and comments are left out.
export function splitStatements(text: string, rules: LexicalRules): StatementSpan[] {
  const statements: StatementSpan[] = []
  let first: Token | undefined
  let last: Token | undefined
  for (const token of tokenize(text, rules)) {
    if (token.kind === TokenKind.Semicolon) {
      addStatement(statements, text, { first, last, terminatorEnd: token.end })
      first = undefined
      last = undefined
    } else if (!isTrivia(token)) {
      first ??= token
      last = token
    }
  }
  addStatement(statements, text, { first, last, terminatorEnd: text.length })
  return statements
}

function addStatement(statements: StatementSpan[], text: string, bounds: Bounds): void {
  const { first, last, terminatorEnd } = bounds
  if (first === undefined || last === undefined) {
    return
  }
  statements.push({
    text: text.slice(first.start, last.end),
    start: first.start,
    end: last.end,
    terminatorEnd,
  })
}

// The statement under the cursor: the one it is in (up to its semicolon), else the one that starts
// later on the same line, else the one that ends before it with no blank line in between.
export function statementAt(
  statements: readonly StatementSpan[],
  offset: number,
  text: string,
): StatementSpan | undefined {
  const following = statements.findIndex((statement) => offset <= statement.terminatorEnd)
  const index = following === -1 ? statements.length : following
  const previous = index === 0 ? undefined : statements.at(index - 1)
  return startingHere(statements.at(index), offset, text) ?? endingNearby(previous, offset, text)
}

function startingHere(
  statement: StatementSpan | undefined,
  offset: number,
  text: string,
): StatementSpan | undefined {
  // Past the start of the statement, the text in between is empty: the cursor is in it.
  return statement !== undefined && isSameLine(text, offset, statement.start)
    ? statement
    : undefined
}

function endingNearby(
  statement: StatementSpan | undefined,
  offset: number,
  text: string,
): StatementSpan | undefined {
  return statement !== undefined && isNearby(text, statement.terminatorEnd, offset)
    ? statement
    : undefined
}

function isSameLine(text: string, from: number, to: number): boolean {
  return !LINE_BREAK.test(text.slice(from, to))
}

function isNearby(text: string, from: number, to: number): boolean {
  return !BLANK_LINE.test(text.slice(from, to))
}
