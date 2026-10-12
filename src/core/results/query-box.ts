import { type ColumnLayout, hiddenCount, shownColumns } from '../grid/column-layout.ts'
import type { LexicalRules } from '../sql/lexical-rules.ts'
import { splitStatements } from '../sql/statements.ts'
import type { QueryBoxText } from './protocol-parts.ts'
import { tableEditorSql, type TableQueryDialect, type TableRead } from './table-query.ts'

// What the query box of a table panel shows with a tab: the statement of the rows of its table
// (what the panel reads, written out), or the query the user ran from the box.
export type BoxSource =
  { readonly table: TableRead; readonly dialect: TableQueryDialect } | { readonly query: string }

// The columns of the tab, the ones the grid shows, and the automatic limit its rows were read with.
export interface BoxShape {
  readonly columns: readonly { readonly name: string }[]
  readonly layout: ColumnLayout
  readonly autoLimit: number | null
}

// Why the text of the box cannot run, for people.
export const BoxQueryProblem = {
  Empty: 'Write a query to run.',
  Statements:
    'The query box runs one statement at a time: remove the others, or open the query in an SQL editor to run them all.',
} as const

export type BoxQuery = { readonly sql: string } | { readonly problem: string }

// The text of the rows of a table is the SQL the panel runs with its values written in: its
// columns (those shown, in their order, when the grid hides some), its key, its WHERE, its filters,
// its sort, and the LIMIT it was read with. Running it unchanged reads the same rows.
export function queryBoxText(source: BoxSource, shape: BoxShape): QueryBoxText {
  if ('query' in source) {
    return { sql: source.query, isCustom: true }
  }
  const written = tableEditorSql(source.table, source.dialect, shownNames(shape))
  const sql = 'problem' in written ? '' : withLimit(written.sql, shape.autoLimit)
  return { sql, isCustom: false }
}

// The statement after the sort, or the condition closed on a line of its own: a LIMIT after it
// cannot land in a comment.
function withLimit(sql: string, limit: number | null): string {
  return limit === null ? sql : `${sql} LIMIT ${String(limit)}`
}

// The columns the grid shows, in its order, when it hides some; none (every column) otherwise.
export function shownNames({ columns, layout }: Omit<BoxShape, 'autoLimit'>): string[] {
  if (hiddenCount(columns, layout) === 0) {
    return []
  }
  return shownColumns(columns, layout).flatMap((index) =>
    columns.slice(index, index + 1).map(({ name }) => name),
  )
}

// The one statement the box runs, without the comments and the semicolon around it.
export function boxQuery(text: string, rules: LexicalRules): BoxQuery {
  const statements = splitStatements(text, rules)
  const first = statements.at(0)
  if (first === undefined) {
    return { problem: BoxQueryProblem.Empty }
  }
  return statements.length === 1 ? { sql: first.text } : { problem: BoxQueryProblem.Statements }
}
