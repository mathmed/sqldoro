import { type Dialect, quoteIdentifier } from '../engine/dialect.ts'
import type { Binder } from './binders.ts'
import { type ColumnFilter, FilterOperator } from './conditions.ts'

type FilterDialect = Pick<Dialect, 'identifierQuote' | 'textType'>

// A filter on a column of the statement: its name, and the type its values are compared as so that
// the server compares them exactly (MySQL compares a number with text as floating-point numbers);
// empty when the server types them from the column.
export interface NamedFilter {
  readonly filter: ColumnFilter
  readonly name: string
  readonly parameterType: string
}

export interface FilterWriting {
  readonly dialect: FilterDialect
  readonly binder: Binder
}

interface Operand {
  readonly column: string
  readonly values: readonly string[]
}

type Build = (operand: Operand) => string

const LIKE_SPECIALS = /[\\%_]/g
const COMPARISONS: ReadonlyMap<FilterOperator, string> = new Map([
  [FilterOperator.Equals, '='],
  [FilterOperator.NotEquals, '<>'],
  [FilterOperator.Less, '<'],
  [FilterOperator.LessOrEqual, '<='],
  [FilterOperator.Greater, '>'],
  [FilterOperator.GreaterOrEqual, '>='],
])
const PATTERNS: ReadonlyMap<FilterOperator, (text: string) => string> = new Map([
  [FilterOperator.Contains, (text: string) => `%${text}%`],
  [FilterOperator.NotContains, (text: string) => `%${text}%`],
  [FilterOperator.StartsWith, (text: string) => `${text}%`],
  [FilterOperator.EndsWith, (text: string) => `%${text}`],
])
const NULL_TESTS: ReadonlyMap<FilterOperator, string> = new Map([
  [FilterOperator.IsNull, 'IS NULL'],
  [FilterOperator.IsNotNull, 'IS NOT NULL'],
])

const BUILDERS: ReadonlyMap<FilterOperator, Build> = new Map<FilterOperator, Build>([
  ...[...COMPARISONS].map(([operator, symbol]): [FilterOperator, Build] => [
    operator,
    ({ column, values }) => [column, symbol, ...values].join(' '),
  ]),
  ...[...NULL_TESTS].map(([operator, test]): [FilterOperator, Build] => [
    operator,
    ({ column }) => `${column} ${test}`,
  ]),
  [FilterOperator.Between, ({ column, values }) => `${column} BETWEEN ${values.join(' AND ')}`],
  [FilterOperator.InList, ({ column, values }) => `${column} IN (${values.join(', ')})`],
])

// The filters as conditions of a WHERE, every value given to the binder and every name quoted.
// Text searches ignore case, as they do in the grid: the column is read as text in lower case and
// compared with a LIKE pattern whose % and _ are searched for, not wildcards.
export function filterConditions(
  filters: readonly NamedFilter[],
  writing: FilterWriting,
): string[] {
  return filters.map((named) => {
    const values = operandsOf(named.filter).map((value) =>
      writing.binder.bind(value, PATTERNS.has(named.filter.operator) ? '' : named.parameterType),
    )
    const column = quoteIdentifier(writing.dialect, named.name)
    const build = BUILDERS.get(named.filter.operator) ?? searchOf(named.filter, writing.dialect)
    return build({ column, values })
  })
}

// The values a filter binds: the LIKE pattern of a text search, the values typed otherwise.
function operandsOf(filter: ColumnFilter): string[] {
  const pattern = PATTERNS.get(filter.operator)
  if (pattern === undefined) {
    return NULL_TESTS.has(filter.operator) ? [] : [...filter.values]
  }
  return filter.values.map((text) => pattern(escapeLike(text.toLowerCase())))
}

function escapeLike(text: string): string {
  return text.replaceAll(LIKE_SPECIALS, '\\$&')
}

function searchOf(filter: ColumnFilter, dialect: FilterDialect): Build {
  const like = filter.operator === FilterOperator.NotContains ? 'NOT LIKE' : 'LIKE'
  return ({ column, values }) =>
    [`LOWER(CAST(${column} AS ${dialect.textType}))`, like, ...values].join(' ')
}
