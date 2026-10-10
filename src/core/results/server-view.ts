import { type Dialect, parameterPlaceholder, quoteIdentifier } from '../engine/dialect.ts'
import type { QueryValue, ResultColumn } from '../engine/query.ts'
import { isReadOnlyQuery } from '../sql/statement-kind.ts'
import { activeFilters, type ColumnFilter, type SortKey, type ViewSpec } from './view.ts'

export type ServerViewDialect = Pick<
  Dialect,
  'identifierQuote' | 'lexical' | 'parameterStyle' | 'textType'
>

export interface ServerQuery {
  readonly sql: string
  readonly values: readonly QueryValue[]
}

const VIEW_ALIAS = 'sqldoro_view'
const LIKE_SPECIALS = /[\\%_]/g

// Why a view cannot run on the server, for people; undefined when it can.
export function serverViewProblem(
  statement: string,
  dialect: ServerViewDialect,
): string | undefined {
  return isReadOnlyQuery(statement, dialect.lexical)
    ? undefined
    : 'Only a single query that reads (SELECT, WITH, TABLE or VALUES) can be sorted and filtered by the server'
}

interface ServerViewTarget {
  readonly columns: readonly ResultColumn[]
  readonly dialect: ServerViewDialect
}

interface Named<T> {
  readonly part: T
  readonly name: string
}

// Runs the query again inside SELECT * FROM (...) with the filters and the sort of the view: the
// filter texts are bound values, the columns quoted names. Undefined when the view is not safe to
// run on the server or names a column that is not unique.
export function serverViewQuery(
  statement: string,
  spec: ViewSpec,
  { columns, dialect }: ServerViewTarget,
): ServerQuery | undefined {
  const filters = named(activeFilters(spec), columns)
  const sort = named(spec.sort, columns)
  if (
    filters === undefined ||
    sort === undefined ||
    serverViewProblem(statement, dialect) !== undefined
  ) {
    return undefined
  }
  return {
    sql: wrapped(statement, { filters, sort, dialect }),
    values: filters.map(({ part }) => likePattern(part.text)),
  }
}

interface WrapParts {
  readonly filters: readonly Named<ColumnFilter>[]
  readonly sort: readonly Named<SortKey>[]
  readonly dialect: ServerViewDialect
}

function wrapped(statement: string, { filters, sort, dialect }: WrapParts): string {
  const conditions = filters.map(
    ({ name }, index) =>
      `LOWER(CAST(${quoteIdentifier(dialect, name)} AS ${dialect.textType})) LIKE ${parameterPlaceholder(dialect, index)}`,
  )
  const order = sort.map(
    ({ part, name }) => `${quoteIdentifier(dialect, name)} ${part.isDescending ? 'DESC' : 'ASC'}`,
  )
  return [
    `SELECT * FROM (\n${statement}\n) AS ${VIEW_ALIAS}`,
    ...(conditions.length === 0 ? [] : [`WHERE ${conditions.join(' AND ')}`]),
    ...(order.length === 0 ? [] : [`ORDER BY ${order.join(', ')}`]),
  ].join('\n')
}

// Contains, without case: % and _ in the text are searched for, not wildcards.
function likePattern(text: string): string {
  return `%${text.toLowerCase().replaceAll(LIKE_SPECIALS, '\\$&')}%`
}

function named<T extends { readonly column: number }>(
  parts: readonly T[],
  columns: readonly ResultColumn[],
): Named<T>[] | undefined {
  const result: Named<T>[] = []
  for (const part of parts) {
    const name = uniqueName(columns, part.column)
    if (name === undefined) {
      return undefined
    }
    result.push({ part, name })
  }
  return result
}

function uniqueName(columns: readonly ResultColumn[], column: number): string | undefined {
  const name = columns.at(column)?.name
  return columns.filter((candidate) => candidate.name === name).length === 1 ? name : undefined
}
