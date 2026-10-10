import type { LexicalRules } from '../sql/lexical-rules.ts'
import { keywordOf } from '../sql/statement-kind.ts'
import { tokenize } from '../sql/tokenizer.ts'
import { isTrivia, type Token, TokenKind } from '../sql/tokens.ts'
import { StatementCategory, type StatementClass } from './statement-class.ts'
import { depthsOf, isSymbol } from './statement-view.ts'

// What runs for a statement, and how many of its rows are kept.
export interface LimitPlan {
  readonly sql: string
  readonly maxRows: number
  // The automatic limit the statement runs with, or null when it has none.
  readonly autoLimit: number | null
}

export interface LimitSettings {
  // The rows a query without a limit of its own gets; null when automatic limits are off.
  readonly autoLimit: number | null
  readonly maxRows: number
  readonly rules: LexicalRules
}

// Where a statement can go after the last token: one past it, or nowhere when a LIMIT cannot
// safely follow (the driver then stops reading at the limit instead).
interface QueryShape {
  readonly hasOwnLimit: boolean
  readonly appendAt: number | undefined
}

const LIMITED_QUERIES: ReadonlySet<string> = new Set(['SELECT', 'TABLE', 'WITH'])
const OWN_LIMITS: ReadonlySet<string> = new Set(['FETCH', 'LIMIT', 'TOP'])
// MySQL has no OFFSET without LIMIT: a LIMIT after it would not mean the same in both dialects.
const NO_APPEND_AFTER: ReadonlySet<string> = new Set(['OFFSET'])
// MySQL runs what /*! */ comments hold, where a LIMIT may hide; a second statement would only get it
// at its end.
const NO_APPEND_KINDS: ReadonlySet<TokenKind> = new Set([
  TokenKind.ExecutableComment,
  TokenKind.Semicolon,
])
const OPEN = '('

// A query that reads and has no limit of its own gets the automatic one: LIMIT n + 1 goes after its
// last token (the extra row tells that more were left), or the driver stops reading after n rows
// when appending is not safe. Anything else runs as written.
export function planLimit(
  sql: string,
  statement: Pick<StatementClass, 'category' | 'verb'>,
  settings: LimitSettings,
): LimitPlan {
  const asWritten = { sql, maxRows: settings.maxRows, autoLimit: null }
  if (settings.autoLimit === null || !isLimitable(statement)) {
    return asWritten
  }
  const shape = shapeOf(sql, settings.rules)
  if (shape.hasOwnLimit) {
    return asWritten
  }
  const limit = Math.min(settings.autoLimit, settings.maxRows)
  return { sql: withLimit(sql, shape.appendAt, limit), maxRows: limit, autoLimit: limit }
}

function isLimitable(statement: Pick<StatementClass, 'category' | 'verb'>): boolean {
  return statement.category === StatementCategory.Read && LIMITED_QUERIES.has(statement.verb)
}

function withLimit(sql: string, appendAt: number | undefined, limit: number): string {
  return appendAt === undefined
    ? sql
    : `${sql.slice(0, appendAt)} LIMIT ${String(limit + 1)}${sql.slice(appendAt)}`
}

function shapeOf(sql: string, rules: LexicalRules): QueryShape {
  const tokens = tokenize(sql, rules)
  const code = tokens.filter((token) => !isTrivia(token))
  const depths = depthsOf(code)
  const top = topDepth(code, depths)
  const topWords = code.filter((...[, index]) => depths.at(index) === top).map(keywordOf)
  const isAppendable =
    !tokens.some((token) => NO_APPEND_KINDS.has(token.kind)) &&
    !topWords.some((word) => NO_APPEND_AFTER.has(word))
  return {
    hasOwnLimit: topWords.some((word) => OWN_LIMITS.has(word)),
    appendAt: isAppendable ? code.at(-1)?.end : undefined,
  }
}

// The depth of the query itself: inside the parentheses that wrap all of it, as in ((SELECT 1)).
function topDepth(code: readonly Token[], depths: readonly number[]): number {
  let top = 0
  while (isSymbol(code.at(top), OPEN) && closingOf(depths, top) === code.length - 1 - top) {
    top += 1
  }
  return top
}

function closingOf(depths: readonly number[], index: number): number {
  return depths.findIndex((depth, at) => at > index && depth === depths.at(index))
}
