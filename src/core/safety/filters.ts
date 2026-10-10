import { keywordOf } from '../sql/statement-kind.ts'
import { identifierName, isIdentifier, type Token, TokenKind } from '../sql/tokens.ts'
import type { UnfilteredWrite } from './statement-class.ts'
import {
  depthsOf,
  findWord,
  isSymbol,
  type Position,
  scopeEnd,
  statementStarts,
  type StatementView,
  type TokenRange,
  wordAt,
} from './statement-view.ts'

const FILTERED_VERBS: ReadonlySet<string> = new Set(['DELETE', 'UPDATE'])
// Words between the verb and the table: UPDATE ONLY t, DELETE LOW_PRIORITY QUICK IGNORE FROM t.
const MODIFIERS: ReadonlySet<string> = new Set(['IGNORE', 'LOW_PRIORITY', 'ONLY', 'QUICK'])
// Clauses after the WHERE condition of an UPDATE or a DELETE.
const AFTER_CONDITION: ReadonlySet<string> = new Set(['LIMIT', 'ORDER', 'RETURNING'])
// Words of a condition that name no column: a condition made only of them, literals, parameters
// and calls (IN, EXISTS, ANY and their parentheses included) is the same for every row.
const CONDITION_WORDS: ReadonlySet<string> = new Set([
  'AND',
  'BETWEEN',
  'CASE',
  'CURRENT_DATE',
  'CURRENT_TIMESTAMP',
  'DISTINCT',
  'ELSE',
  'END',
  'ESCAPE',
  'FALSE',
  'FROM',
  'ILIKE',
  'IS',
  'LIKE',
  'NOT',
  'NULL',
  'OR',
  'SELECT',
  'SIMILAR',
  'THEN',
  'TO',
  'TRUE',
  'UNKNOWN',
  'WHEN',
  'WHERE',
])
const OPEN = '('
const DOT = '.'
const EQUALS = '='
const FROM = 'FROM'
const WHERE = 'WHERE'
// From a part of a qualified name to the next one: the dot, then the name.
const NEXT_PART = 2

// The UPDATE and DELETE statements, the statement itself or inside it (WITH queries), that reach
// every row of their table.
export function unfilteredWrites(view: StatementView): UnfilteredWrite[] {
  return statementStarts(view)
    .filter((start) => FILTERED_VERBS.has(wordAt(view, start.index)))
    .flatMap((start) => unfilteredAt(view, start))
}

function unfilteredAt(view: StatementView, start: Position): UnfilteredWrite[] {
  const end = scopeEnd(view, start)
  const where = findWord(view, { from: start, to: end }, (word) => word === WHERE)
  const condition =
    where === -1 ? undefined : conditionOf(view, { from: { ...start, index: where }, to: end })
  if (condition !== undefined && !isAlwaysTrue(condition)) {
    return []
  }
  return [
    {
      verb: wordAt(view, start.index),
      table: targetTable(view, start.index),
      hasAlwaysTrueWhere: condition !== undefined,
    },
  ]
}

// The condition after a WHERE, up to the clause after it or the end of its statement.
function conditionOf(view: StatementView, range: TokenRange): Token[] {
  const after = findWord(view, range, (word) => AFTER_CONDITION.has(word))
  return view.tokens.slice(range.from.index + 1, after === -1 ? range.to : after)
}

// The table an UPDATE or a DELETE changes: the last part of its name, without quotes.
function targetTable(view: StatementView, start: number): string {
  const afterVerb = skipModifiers(view, start + 1)
  const name = wordAt(view, afterVerb) === FROM ? skipModifiers(view, afterVerb + 1) : afterVerb
  return lastNamePart(view.tokens, name)
}

function skipModifiers(view: StatementView, index: number): number {
  let at = index
  while (MODIFIERS.has(wordAt(view, at))) {
    at += 1
  }
  return at
}

function lastNamePart(tokens: readonly Token[], index: number): string {
  let at = index
  while (isSymbol(tokens.at(at + 1), DOT) && isIdentifier(tokens.at(at + NEXT_PART))) {
    at += NEXT_PART
  }
  const token = tokens.at(at)
  return isIdentifier(token) ? identifierName(token) : ''
}

// A condition true for every row: one of its OR branches holds terms that are all always true.
function isAlwaysTrue(condition: readonly Token[]): boolean {
  return splitAt(condition, 'OR').some((branch) => splitAt(branch, 'AND').every(isAlwaysTrueTerm))
}

function isAlwaysTrueTerm(term: readonly Token[]): boolean {
  const inner = unwrapped(term)
  if (inner !== undefined) {
    return isAlwaysTrue(inner)
  }
  return !term.some((...[, index]) => isColumn(term, index)) || isSelfComparison(term)
}

// The parts between the occurrences of a word outside parentheses.
function splitAt(tokens: readonly Token[], word: string): Token[][] {
  const depths = depthsOf(tokens)
  const parts: Token[][] = []
  let part: Token[] = []
  tokens.forEach((token, index) => {
    if (depths.at(index) === 0 && keywordOf(token) === word) {
      parts.push(part)
      part = []
    } else {
      part.push(token)
    }
  })
  parts.push(part)
  return parts
}

// The inside of a term wrapped in one pair of parentheses: (a = 1 OR b = 2).
function unwrapped(term: readonly Token[]): Token[] | undefined {
  const depths = depthsOf(term)
  const closing = depths.findIndex((depth, index) => index > 0 && depth === 0)
  return isSymbol(term.at(0), OPEN) && closing === term.length - 1 ? term.slice(1, -1) : undefined
}

// A name that is neither a word of conditions nor the name of a function: a column.
function isColumn(term: readonly Token[], index: number): boolean {
  const token = term.at(index)
  return token?.kind === TokenKind.QuotedIdentifier || isColumnWord(term, index)
}

function isColumnWord(term: readonly Token[], index: number): boolean {
  const token = term.at(index)
  return (
    token?.kind === TokenKind.Word &&
    !CONDITION_WORDS.has(keywordOf(token)) &&
    !isSymbol(term.at(index + 1), OPEN)
  )
}

// id = id: a column compared with itself.
function isSelfComparison(term: readonly Token[]): boolean {
  const equals = term.findIndex((token) => isSymbol(token, EQUALS))
  const left = term.slice(0, equals).map((token) => token.text.toUpperCase())
  const right = term.slice(equals + 1).map((token) => token.text.toUpperCase())
  return left.join(' ') === right.join(' ')
}
