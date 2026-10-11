import type { ObjectRef } from '../engine/catalog.ts'
import { type Dialect, ParameterStyle, qualifiedName } from '../engine/dialect.ts'
import { codeTokens, statementsOf, viewOf } from '../safety/statement-view.ts'
import { significantTokens } from '../sql/statement-kind.ts'
import { type Token, TokenKind } from '../sql/tokens.ts'

// The SQL of a table read with a condition, or why the condition cannot be one, for people.
export type TableFilterQuery = { readonly sql: string } | { readonly problem: string }

export const TableFilterProblem = {
  Unclosed: 'The condition has a string, a quoted name or a comment that does not end.',
  Empty: 'The condition holds only comments: write one, or clear it to read every row.',
  Statements: 'The condition cannot end the statement or start another: remove its semicolon (;).',
  Parentheses: 'The parentheses of the condition do not match.',
  Parameters:
    'The condition cannot hold placeholders of bound values (? in MySQL, $1 in PostgreSQL): write the values in it.',
} as const

export type ConditionDialect = Pick<Dialect, 'identifierQuote' | 'lexical' | 'parameterStyle'>

const LABEL_SEPARATOR = ' — '
const PATH_SEPARATOR = '/'

// What opening a table or view of the explorer runs: every column of every row, the object named by
// its schema and its name. The schema is the namespace of the object: in MySQL, its database.
export function tableDataQuery(
  table: ObjectRef,
  dialect: Pick<Dialect, 'identifierQuote'>,
): string {
  return `SELECT * FROM ${qualifiedName(dialect, [table.schema, table.name])}`
}

// The rows of a table that meet a condition, written by the user like a query in an editor: it
// runs through the guards, which classify it. Here it is only kept to one condition of one
// statement: inside parentheses of its own, closed on a line of their own so that a -- comment at
// its end cannot hide them. A blank condition reads every row.
export function tableFilterQuery(
  table: ObjectRef,
  condition: string,
  dialect: ConditionDialect,
): TableFilterQuery {
  const read = tableDataQuery(table, dialect)
  if (condition.trim() === '') {
    return { sql: read }
  }
  const opening = `${read} WHERE (`
  const sql = `${opening}${condition}\n)`
  const before = significantTokens(opening, dialect.lexical).length
  const problem = statementProblem(sql, { before, dialect })
  return problem === undefined ? { sql } : { problem }
}

interface Reading {
  // How many tokens of code come before the condition: those of the read and of WHERE (.
  readonly before: number
  readonly dialect: ConditionDialect
}

// The statement as the server reads it (the code of MySQL's executable comments included): its
// strings and comments end, it stays one statement, and the condition between the parentheses
// holds code.
function statementProblem(sql: string, { before, dialect }: Reading): string | undefined {
  const code = codeTokens(sql, dialect.lexical)
  if (code === undefined) {
    return TableFilterProblem.Unclosed
  }
  return statementsOf(code).length === 1
    ? conditionProblem(code.slice(before, -1), dialect)
    : TableFilterProblem.Statements
}

// The parentheses of the condition close inside it: it cannot reach out of its own. Placeholders
// would take the values sqldoro binds to the statement around it.
function conditionProblem(
  condition: readonly Token[],
  dialect: Pick<Dialect, 'parameterStyle'>,
): string | undefined {
  if (condition.length === 0) {
    return TableFilterProblem.Empty
  }
  if (condition.some((token) => isPlaceholder(token, dialect))) {
    return TableFilterProblem.Parameters
  }
  return viewOf(condition) === undefined ? TableFilterProblem.Parentheses : undefined
}

// MySQL binds ?; PostgreSQL binds $1, and reads ? as an operator of JSON.
function isPlaceholder(token: Token, dialect: Pick<Dialect, 'parameterStyle'>): boolean {
  const isNumbered = dialect.parameterStyle === ParameterStyle.Numbered
  return token.kind === TokenKind.Parameter && token.text.startsWith('$') === isNumbered
}

// "orders — sales": the table and where it is, as messages name the source of its rows.
export function tableDataLabel(table: ObjectRef): string {
  return `${table.name}${LABEL_SEPARATOR}${table.schema}`
}

// "Shop/shop/sales.orders": the panel with the rows of a table, named like a path from its
// connection and database. In MySQL, where the schema is the database, the table goes alone.
export function tablePanelTitle(
  connection: string,
  table: ObjectRef,
  dialect: Pick<Dialect, 'hasSchemas'>,
): string {
  const name = dialect.hasSchemas ? `${table.schema}.${table.name}` : table.name
  return [connection, table.database, name].join(PATH_SEPARATOR)
}
