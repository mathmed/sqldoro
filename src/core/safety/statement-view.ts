import type { LexicalRules } from '../sql/lexical-rules.ts'
import { keywordOf } from '../sql/statement-kind.ts'
import { tokenize } from '../sql/tokenizer.ts'
import { isTrivia, type Token, tokenAt, TokenKind } from '../sql/tokens.ts'

// The code of one statement, and how deep in parentheses each of its tokens is.
export interface StatementView {
  readonly tokens: readonly Token[]
  readonly depths: readonly number[]
}

// A token of a statement, and its depth.
export interface Position {
  readonly index: number
  readonly depth: number
}

export interface TokenRange {
  readonly from: Position
  // Excluded.
  readonly to: number
}

const EXECUTABLE_OPEN = '/*!'
// The server version an executable comment may start with: /*!50110 ... */.
const VERSION = /^\d+/
const COMMENT_CLOSE = '*/'
const OPEN = '('
const CLOSE = ')'
// What a WITH clause leads to.
const MAIN_VERBS: ReadonlySet<string> = new Set([
  'DELETE',
  'INSERT',
  'MERGE',
  'SELECT',
  'TABLE',
  'UPDATE',
  'VALUES',
])

// The tokens the server reads as code: whitespace and comments go, and the code of MySQL's /*! */
// comments, which the server runs, takes their place. Undefined when a string, a quoted name or a
// comment is not closed: then nobody can tell where the code ends.
export function codeTokens(sql: string, rules: LexicalRules): Token[] | undefined {
  const tokens = tokenize(sql, rules).flatMap((token) => expanded(token, rules))
  return tokens.some((token) => token.isOpen)
    ? undefined
    : tokens.filter((token) => !isTrivia(token))
}

function expanded(token: Token, rules: LexicalRules): Token[] {
  if (token.kind !== TokenKind.ExecutableComment || token.isOpen) {
    return [token]
  }
  const code = token.text.slice(EXECUTABLE_OPEN.length, -COMMENT_CLOSE.length).replace(VERSION, '')
  return tokenize(code, rules).flatMap((inner) => expanded(inner, rules))
}

// The statements of a script, cut at its semicolons; empty ones are left out.
export function statementsOf(tokens: readonly Token[]): Token[][] {
  const statements: Token[][] = []
  let current: Token[] = []
  for (const token of tokens) {
    if (token.kind === TokenKind.Semicolon) {
      statements.push(current)
      current = []
    } else {
      current.push(token)
    }
  }
  statements.push(current)
  return statements.filter((statement) => statement.length > 0)
}

// How deep in parentheses each token is: a parenthesis is at the depth of what is around it.
export function depthsOf(tokens: readonly Token[]): number[] {
  let depth = 0
  return tokens.map((token) => {
    depth -= isSymbol(token, CLOSE) ? 1 : 0
    const current = depth
    depth += isSymbol(token, OPEN) ? 1 : 0
    return current
  })
}

// Undefined when the parentheses do not match.
export function viewOf(tokens: readonly Token[]): StatementView | undefined {
  const depths = depthsOf(tokens)
  const opened = tokens.filter((token) => isSymbol(token, OPEN)).length
  const closed = tokens.filter((token) => isSymbol(token, CLOSE)).length
  return opened === closed && depths.every((depth) => depth >= 0) ? { tokens, depths } : undefined
}

export function isSymbol(token: Token | undefined, symbol: string): boolean {
  return token?.kind === TokenKind.Symbol && token.text === symbol
}

export function wordAt(view: StatementView, index: number): string {
  return keywordOf(tokenAt(view.tokens, index))
}

export function isOpeningAt(view: StatementView, index: number): boolean {
  return isSymbol(tokenAt(view.tokens, index), OPEN)
}

// The first word, after the parentheses a statement may start with: SELECT in ((SELECT 1)). Its
// depth is the number of those parentheses.
export function leadingIndex(view: StatementView): number {
  return view.tokens.findIndex((token) => !isSymbol(token, OPEN))
}

export function leadingWord(view: StatementView): string {
  return wordAt(view, leadingIndex(view))
}

// Where the statement and the statements inside it begin: its first word, the first word inside
// parentheses (subqueries, WITH queries) unless it names a function, and what each WITH clause
// leads to.
export function statementStarts(view: StatementView): Position[] {
  const starts = view.depths.flatMap((depth, index) =>
    isStart(view, index) ? [{ index, depth }] : [],
  )
  return [...starts, ...starts.flatMap((start) => mainOfWith(view, start))]
}

// What is not a word never starts a statement: wordAt reads it as an empty word.
function isStart(view: StatementView, index: number): boolean {
  return index === 0 || (isOpeningAt(view, index - 1) && !isOpeningAt(view, index + 1))
}

// The statement a WITH clause leads to; index -1 (no word) when it leads to none.
function mainOfWith(view: StatementView, start: Position): Position[] {
  if (wordAt(view, start.index) !== 'WITH') {
    return []
  }
  const range = { from: start, to: view.tokens.length }
  return [{ index: findWord(view, range, (word) => MAIN_VERBS.has(word)), depth: start.depth }]
}

// Where the parentheses around a token close, or the end of the statement.
export function scopeEnd(view: StatementView, position: Position): number {
  const after = position.index + 1
  const end = view.depths.slice(after).findIndex((depth) => depth < position.depth)
  return end === -1 ? view.tokens.length : after + end
}

// The first word of the range at the depth of its start that `isWanted`; -1 when there is none.
export function findWord(
  view: StatementView,
  { from, to }: TokenRange,
  isWanted: (word: string) => boolean,
): number {
  return view.depths.findIndex(
    (depth, index) =>
      index > from.index && index < to && depth === from.depth && isWanted(wordAt(view, index)),
  )
}

// Whether a word of `seconds` follows `first` somewhere in the statement: FOR UPDATE, READ WRITE.
export function hasPair(view: StatementView, first: string, seconds: ReadonlySet<string>): boolean {
  return view.tokens.some(
    (...[, index]) => wordAt(view, index) === first && seconds.has(wordAt(view, index + 1)),
  )
}
