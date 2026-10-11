import { type Dialect, quoteIdentifier } from '../engine/dialect.ts'
import type { QueryValue, ResultColumn } from '../engine/query.ts'
import { isReadOnlyQuery } from '../sql/statement-kind.ts'
import { parameterBinder } from './binders.ts'
import { filterConditions, type NamedFilter } from './filter-sql.ts'
import { activeFilters, type SortKey, type ViewSpec } from './view.ts'

export type ServerViewDialect = Pick<
  Dialect,
  'identifierQuote' | 'lexical' | 'parameterStyle' | 'textType'
>

export interface ServerQuery {
  readonly sql: string
  readonly values: readonly QueryValue[]
}

const VIEW_ALIAS = 'sqldoro_view'

// Why a view cannot run on the server, for people; undefined when it can.
export function serverViewProblem(
  statement: string,
  dialect: ServerViewDialect,
): string | undefined {
  return isReadOnlyQuery(statement, dialect.lexical)
    ? undefined
    : 'Only a single query that reads (SELECT, WITH, TABLE or VALUES) can be sorted and filtered by the server'
}

export interface ServerViewTarget {
  readonly columns: readonly ResultColumn[]
  readonly dialect: ServerViewDialect
  // The type each column's values are cast to, by column name, where the catalog says.
  readonly parameterTypes: ReadonlyMap<string, string>
}

export interface NamedSort {
  readonly key: SortKey
  readonly name: string
}

// The filters and the sort of a view, by the names of the columns they are on; undefined when one
// is on a column that is not there or whose name is not unique.
export interface NamedView {
  readonly filters: readonly NamedFilter[]
  readonly sort: readonly NamedSort[]
}

// Runs the query again inside SELECT * FROM (...) with the filters and the sort of the view: the
// values are bound, the columns quoted names. Undefined when the view is not safe to run on the
// server or names a column that is not unique.
export function serverViewQuery(
  statement: string,
  spec: ViewSpec,
  target: ServerViewTarget,
): ServerQuery | undefined {
  const view = namedView(spec, target)
  if (view === undefined || serverViewProblem(statement, target.dialect) !== undefined) {
    return undefined
  }
  const binder = parameterBinder(target.dialect, 0)
  const conditions = filterConditions(view.filters, { dialect: target.dialect, binder })
  return {
    sql: [
      `SELECT * FROM (\n${statement}\n) AS ${VIEW_ALIAS}`,
      ...(conditions.length === 0 ? [] : [`WHERE ${conditions.join(' AND ')}`]),
      ...orderBy(view.sort, target.dialect),
    ].join('\n'),
    values: binder.values(),
  }
}

// ORDER BY the columns of the sort, in order; nothing without one.
export function orderBy(
  sort: readonly NamedSort[],
  dialect: Pick<Dialect, 'identifierQuote'>,
): string[] {
  const order = sort.map(
    ({ key, name }) => `${quoteIdentifier(dialect, name)} ${key.isDescending ? 'DESC' : 'ASC'}`,
  )
  return order.length === 0 ? [] : [`ORDER BY ${order.join(', ')}`]
}

export function namedView(
  spec: ViewSpec,
  {
    columns,
    parameterTypes,
  }: {
    readonly columns: readonly Pick<ResultColumn, 'name'>[]
    readonly parameterTypes: ReadonlyMap<string, string>
  },
): NamedView | undefined {
  const filters: NamedFilter[] = []
  for (const filter of activeFilters(spec)) {
    const name = uniqueName(columns, filter.column)
    if (name === undefined) {
      return undefined
    }
    filters.push({ filter, name, parameterType: parameterTypes.get(name) ?? '' })
  }
  const sort = namedSort(spec.sort, columns)
  return sort === undefined ? undefined : { filters, sort }
}

function namedSort(
  keys: readonly SortKey[],
  columns: readonly Pick<ResultColumn, 'name'>[],
): NamedSort[] | undefined {
  const sort: NamedSort[] = []
  for (const key of keys) {
    const name = uniqueName(columns, key.column)
    if (name === undefined) {
      return undefined
    }
    sort.push({ key, name })
  }
  return sort
}

function uniqueName(
  columns: readonly Pick<ResultColumn, 'name'>[],
  column: number,
): string | undefined {
  const name = columns.at(column)?.name
  return columns.filter((candidate) => candidate.name === name).length === 1 ? name : undefined
}
