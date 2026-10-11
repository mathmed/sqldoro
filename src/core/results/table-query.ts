import type { ObjectRef } from '../engine/catalog.ts'
import { type Dialect, qualifiedName, quoteIdentifier } from '../engine/dialect.ts'
import { keyConditions, type KeyMatch } from '../navigation/keys.ts'
import { type Binder, literalBinder, parameterBinder } from './binders.ts'
import { filterConditions } from './filter-sql.ts'
import { type NamedView, orderBy, type ServerQuery } from './server-view.ts'
import { type TableFilterQuery, tableFilterQuery } from './table-data.ts'

export type TableQueryDialect = Pick<
  Dialect,
  'identifierQuote' | 'lexical' | 'parameterStyle' | 'textType'
>

// What a table panel reads: the rows of a table a key leads to (a navigation), that meet the WHERE
// the user typed and the filters of the view, in the order of its sort.
export interface TableRead {
  readonly table: ObjectRef
  readonly key: KeyMatch | undefined
  readonly condition: string
  readonly view: NamedView
  // The type each column's values are compared as, by column name, where the catalog says.
  readonly parameterTypes: ReadonlyMap<string, string>
}

export type TableQuery = ServerQuery | { readonly problem: string }

// The statement a table panel runs: the key and the filters are bound values, the WHERE goes as
// typed (checked to stay one condition of one statement), and every name is quoted. It stays a
// plain SELECT of the table, so its rows can be edited.
export function tableReadQuery(read: TableRead, dialect: TableQueryDialect): TableQuery {
  const binder = parameterBinder(dialect, 0)
  const query = tableSql(read, { dialect, binder, columns: [] })
  return 'problem' in query ? query : { sql: query.sql, values: binder.values() }
}

// The same statement for an SQL editor, with the values written in it: what the panel runs, without
// its automatic limit, which the editor gives it again. `columns` lists the columns to select
// (those shown, in their order); empty selects them all.
export function tableEditorSql(
  read: TableRead,
  dialect: TableQueryDialect,
  columns: readonly string[],
): TableFilterQuery {
  return tableSql(read, { dialect, binder: literalBinder(dialect), columns })
}

// The rows a key leads to, without a condition or a view: a key never fails to write.
type KeyRead = Pick<TableRead, 'parameterTypes' | 'table'> & { readonly key: KeyMatch }
type KeyDialect = Pick<Dialect, 'identifierQuote' | 'parameterStyle'>

// The row a key names, with bound values: what a peek reads.
export function tableRowQuery(read: KeyRead, dialect: KeyDialect): ServerQuery {
  return keyQuery('*', read, dialect)
}

// How many rows of a table a key leads to: what the references of a row count.
export function tableCountQuery(read: KeyRead, dialect: KeyDialect): ServerQuery {
  return keyQuery(`COUNT(*) AS ${quoteIdentifier(dialect, 'count')}`, read, dialect)
}

function keyQuery(list: string, read: KeyRead, dialect: KeyDialect): ServerQuery {
  const binder = parameterBinder(dialect, 0)
  const where = keyConditions(read.key, { dialect, binder, parameterTypes: read.parameterTypes })
  const table = qualifiedName(dialect, [read.table.schema, read.table.name])
  return {
    sql: `SELECT ${list} FROM ${table} WHERE ${where.join(' AND ')}`,
    values: binder.values(),
  }
}

interface Writing {
  readonly dialect: TableQueryDialect
  readonly binder: Binder
  readonly columns: readonly string[]
}

function tableSql(read: TableRead, writing: Writing): TableFilterQuery {
  const checked = tableFilterQuery(read.table, read.condition, writing.dialect)
  if ('problem' in checked) {
    return checked
  }
  const where = whereParts(read, writing)
  const sql = [
    selectOf(read.table, writing),
    ...(where.length === 0 ? [] : [` WHERE ${where.join(' AND ')}`]),
    ...orderBy(read.view.sort, writing.dialect).map((order) => `\n${order}`),
  ].join('')
  return { sql }
}

function selectOf(table: ObjectRef, { dialect, columns }: Writing): string {
  const list =
    columns.length === 0
      ? '*'
      : columns.map((column) => quoteIdentifier(dialect, column)).join(', ')
  return `SELECT ${list} FROM ${qualifiedName(dialect, [table.schema, table.name])}`
}

// The key first, then the condition in parentheses of its own (closed on a line of their own, so
// that a -- comment at its end cannot hide them), then the filters.
function whereParts(read: TableRead, { dialect, binder }: Writing): string[] {
  const { parameterTypes } = read
  const key =
    read.key === undefined ? [] : keyConditions(read.key, { dialect, binder, parameterTypes })
  const condition = read.condition.trim() === '' ? [] : [`(${read.condition}\n)`]
  return [...key, ...condition, ...filterConditions(read.view.filters, { dialect, binder })]
}
