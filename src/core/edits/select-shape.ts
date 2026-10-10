import { readAlias, readName } from '../completion/references.ts'
import type { Dialect } from '../engine/dialect.ts'
import { classifyStatement } from '../safety/classify.ts'
import { StatementCategory } from '../safety/statement-class.ts'
import {
  codeTokens,
  depthsOf,
  isSymbol,
  statementsOf,
  type StatementView,
} from '../safety/statement-view.ts'
import { keywordOf } from '../sql/statement-kind.ts'
import { type Token, tokenAt } from '../sql/tokens.ts'

export type ShapeDialect = Pick<Dialect, 'lexical' | 'sideEffectFunctions'>

// The table a plain SELECT reads, by the parts of its name as they are written (without quotes).
export interface TableReference {
  readonly parts: readonly string[]
}

// Whether the rows of a query are rows of one table, as far as its text tells; why not otherwise,
// for people. The columns the server says the rows come from are checked apart.
export type SelectShape = { readonly table: TableReference } | { readonly problem: string }

export const ShapeProblem = {
  Unreadable: 'sqldoro cannot read this statement.',
  NotARead: 'Only the rows of a query that only reads can be edited.',
  Several: 'Only the rows of a single query can be edited.',
  NotASelect: 'Only the rows of a SELECT can be edited.',
  Distinct: 'The query removes duplicate rows (DISTINCT): its rows are not rows of a table.',
  NoTable: 'The query reads no table.',
  Join: 'The query reads several tables: sqldoro cannot tell which row of which table a cell belongs to.',
  Subquery: 'The query reads from a subquery or a function, not from a table.',
  Grouped: 'The query groups rows (GROUP BY, HAVING): its rows are not rows of a table.',
  Combined:
    'The query combines queries (UNION, INTERSECT, EXCEPT): its rows are not rows of one table.',
  Window: 'The query defines windows (WINDOW).',
  Unknown: 'sqldoro cannot tell which rows of the table the query reads.',
} as const

const SELECT = 'SELECT'
const FROM = 'FROM'
const ALL = 'ALL'
// SELECT ALL: the columns start after both words.
const AFTER_ALL = 2
const OPEN = '('
const DOT = '.'
const STAR = '*'
const COMMA = ','
const DISTINCT_WORDS: ReadonlySet<string> = new Set(['DISTINCT', 'DISTINCTROW'])
// Words that make the rows of a query something else than rows of its table, wherever they are
// outside parentheses.
const OUTSIDE_PARENTHESES: ReadonlyMap<string, string> = new Map([
  ['GROUP', ShapeProblem.Grouped],
  ['HAVING', ShapeProblem.Grouped],
  ['UNION', ShapeProblem.Combined],
  ['INTERSECT', ShapeProblem.Combined],
  ['EXCEPT', ShapeProblem.Combined],
  ['MINUS', ShapeProblem.Combined],
  ['WINDOW', ShapeProblem.Window],
  ['JOIN', ShapeProblem.Join],
  ['STRAIGHT_JOIN', ShapeProblem.Join],
])
// What may follow the table and its alias: the rows it keeps, their order and how many.
const AFTER_TABLE: ReadonlySet<string> = new Set(['WHERE', 'ORDER', 'LIMIT', 'OFFSET', 'FETCH'])

export function selectShape(sql: string, dialect: ShapeDialect): SelectShape {
  const tokens = codeTokens(sql, dialect.lexical)
  if (tokens === undefined) {
    return { problem: ShapeProblem.Unreadable }
  }
  if (classifyStatement(sql, dialect).category !== StatementCategory.Read) {
    return { problem: ShapeProblem.NotARead }
  }
  const statement = onlyOne(statementsOf(tokens))
  return statement === undefined
    ? { problem: ShapeProblem.Several }
    : shapeOf({ tokens: statement, depths: depthsOf(statement) })
}

function onlyOne<T>(list: readonly T[]): T | undefined {
  return list.length === 1 ? list[0] : undefined
}

function shapeOf(view: StatementView): SelectShape {
  const problem = headProblem(view) ?? wordProblem(view)
  if (problem !== undefined) {
    return { problem }
  }
  const from = view.tokens.findIndex(
    (token, index) => view.depths.at(index) === 0 && keywordOf(token) === FROM,
  )
  if (from === -1) {
    return { problem: ShapeProblem.NoTable }
  }
  const listProblem = columnsProblem(view.tokens.slice(listStart(view), from))
  return listProblem === undefined
    ? tableAfter(view.tokens.slice(from + 1))
    : { problem: listProblem }
}

function headProblem({ tokens }: StatementView): string | undefined {
  if (keywordOf(tokens[0]) !== SELECT) {
    return ShapeProblem.NotASelect
  }
  return DISTINCT_WORDS.has(keywordOf(tokens[1])) ? ShapeProblem.Distinct : undefined
}

function wordProblem({ tokens, depths }: StatementView): string | undefined {
  const words = tokens.filter((...[, index]) => depths.at(index) === 0).map(keywordOf)
  return words.map((word) => OUTSIDE_PARENTHESES.get(word)).find((found) => found !== undefined)
}

// The columns start after SELECT, and after ALL when it is there.
function listStart({ tokens }: StatementView): number {
  return keywordOf(tokens[1]) === ALL ? AFTER_ALL : 1
}

// A comma inside parentheses only ever cuts an expression into pieces that are expressions too.
function columnsProblem(list: readonly Token[]): string | undefined {
  const items = splitAt(list, COMMA)
  const expression = items.findIndex((item) => !isPlainColumn(item))
  return expression === -1
    ? undefined
    : `Column ${String(expression + 1)} of the query is an expression, not a column of the table: only queries that select plain columns can be edited.`
}

function splitAt(tokens: readonly Token[], symbol: string): Token[][] {
  const parts: Token[][] = []
  let part: Token[] = []
  for (const token of tokens) {
    if (isSymbol(token, symbol)) {
      parts.push(part)
      part = []
    } else {
      part.push(token)
    }
  }
  parts.push(part)
  return parts
}

// *, t.*, column, t.column, s.t.column AS alias, s.t.column alias. A name read up to a dot (t.)
// only takes a star after it.
function isPlainColumn(item: readonly Token[]): boolean {
  const name = readName(item, 0)
  const rest = item.slice(name.next)
  const isColumn = name.value.length > 0 && !isSymbol(tokenAt(item, name.next - 1), DOT)
  return isColumn ? isAlias(rest) : isStar(rest)
}

function isStar(tokens: readonly Token[]): boolean {
  return tokens.length === 1 && isSymbol(tokens[0], STAR)
}

// Nothing, or an alias that ends the item: readAlias reads nothing when there is none.
function isAlias(rest: readonly Token[]): boolean {
  return readAlias(rest, 0).next === rest.length
}

type Name = ReturnType<typeof readName>

// FROM t, FROM s.t AS x, then nothing or the clauses that only choose and order rows.
function tableAfter(tokens: readonly Token[]): SelectShape {
  const name = readName(tokens, 0)
  const problem = nameProblem(tokens, name)
  return problem === undefined ? afterName(tokens, name) : { problem }
}

// A parenthesis where the table or right after its name: a subquery, or a function of rows.
function nameProblem(tokens: readonly Token[], name: Name): string | undefined {
  if (isSymbol(tokens.at(name.next), OPEN)) {
    return ShapeProblem.Subquery
  }
  return name.value.length === 0 ? ShapeProblem.Unknown : undefined
}

function afterName(tokens: readonly Token[], name: Name): SelectShape {
  const next = tokens.at(readAlias(tokens, name.next).next)
  if (next === undefined || AFTER_TABLE.has(keywordOf(next))) {
    return { table: { parts: name.value } }
  }
  return { problem: isSymbol(next, COMMA) ? ShapeProblem.Join : ShapeProblem.Unknown }
}
