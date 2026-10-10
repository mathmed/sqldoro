import type { ObjectRef } from '../engine/catalog.ts'
import { type Dialect, qualifiedName } from '../engine/dialect.ts'
import { codeTokens, statementsOf, viewOf } from '../safety/statement-view.ts'
import type { LexicalRules } from '../sql/lexical-rules.ts'
import { significantTokens } from '../sql/statement-kind.ts'
import type { Token } from '../sql/tokens.ts'

// The SQL of a table read with a condition, or why the condition cannot be one, for people.
export type TableFilterQuery = { readonly sql: string } | { readonly problem: string }

export const TableFilterProblem = {
  Unclosed: 'The condition has a string, a quoted name or a comment that does not end.',
  Empty: 'The condition holds only comments: write one, or clear it to read every row.',
  Statements: 'The condition cannot end the statement or start another: remove its semicolon (;).',
  Parentheses: 'The parentheses of the condition do not match.',
} as const

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
  dialect: Pick<Dialect, 'identifierQuote' | 'lexical'>,
): TableFilterQuery {
  const read = tableDataQuery(table, dialect)
  if (condition.trim() === '') {
    return { sql: read }
  }
  const opening = `${read} WHERE (`
  const sql = `${opening}${condition}\n)`
  const before = significantTokens(opening, dialect.lexical).length
  const problem = statementProblem(sql, { before, rules: dialect.lexical })
  return problem === undefined ? { sql } : { problem }
}

interface Reading {
  // How many tokens of code come before the condition: those of the read and of WHERE (.
  readonly before: number
  readonly rules: LexicalRules
}

// The statement as the server reads it (the code of MySQL's executable comments included): its
// strings and comments end, it stays one statement, and the condition between the parentheses
// holds code.
function statementProblem(sql: string, { before, rules }: Reading): string | undefined {
  const code = codeTokens(sql, rules)
  if (code === undefined) {
    return TableFilterProblem.Unclosed
  }
  return statementsOf(code).length === 1
    ? conditionProblem(code.slice(before, -1))
    : TableFilterProblem.Statements
}

// The parentheses of the condition close inside it: it cannot reach out of its own.
function conditionProblem(condition: readonly Token[]): string | undefined {
  if (condition.length === 0) {
    return TableFilterProblem.Empty
  }
  return viewOf(condition) === undefined ? TableFilterProblem.Parentheses : undefined
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
