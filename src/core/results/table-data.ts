import type { ObjectRef } from '../engine/catalog.ts'
import { type Dialect, qualifiedName } from '../engine/dialect.ts'

const TITLE_SEPARATOR = ' — '

// What opening a table or view of the explorer runs: every column of every row, the object named by
// its schema and its name. The schema is the namespace of the object: in MySQL, its database.
export function tableDataQuery(
  table: ObjectRef,
  dialect: Pick<Dialect, 'identifierQuote'>,
): string {
  return `SELECT * FROM ${qualifiedName(dialect, [table.schema, table.name])}`
}

// "orders — sales": the panel with the rows of a table, named by the table and where it is.
export function tableDataTitle(table: ObjectRef): string {
  return `${table.name}${TITLE_SEPARATOR}${table.schema}`
}
