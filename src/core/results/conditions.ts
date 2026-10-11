import { ColumnKind } from '../engine/query.ts'

// How the filter of a column compares its values with what the user gave it.
export const FilterOperator = {
  Equals: 'equals',
  NotEquals: 'notEquals',
  Contains: 'contains',
  NotContains: 'notContains',
  StartsWith: 'startsWith',
  EndsWith: 'endsWith',
  Less: 'less',
  LessOrEqual: 'lessOrEqual',
  Greater: 'greater',
  GreaterOrEqual: 'greaterOrEqual',
  Between: 'between',
  InList: 'inList',
  IsNull: 'isNull',
  IsNotNull: 'isNotNull',
} as const

export type FilterOperator = (typeof FilterOperator)[keyof typeof FilterOperator]

// One condition on a column: its operator and the values it compares with, as typed. Conditions on
// the same column, and on different columns, all apply (AND).
export interface ColumnFilter {
  readonly column: number
  readonly operator: FilterOperator
  readonly values: readonly string[]
}

const OPERATORS: ReadonlySet<string> = new Set(Object.values(FilterOperator))

// Operators that take no value, two (a range) or a list; the others take one.
const NO_VALUE: ReadonlySet<FilterOperator> = new Set([
  FilterOperator.IsNull,
  FilterOperator.IsNotNull,
])
const TEXT_SEARCH: ReadonlySet<FilterOperator> = new Set([
  FilterOperator.Contains,
  FilterOperator.NotContains,
  FilterOperator.StartsWith,
  FilterOperator.EndsWith,
])
const RANGE_VALUES = 2
// The operators that compare with the empty text as with any other text.
const TAKES_EMPTY_TEXT: ReadonlySet<FilterOperator> = new Set([
  FilterOperator.Equals,
  FilterOperator.NotEquals,
  FilterOperator.InList,
])

const EVERY_KIND: readonly FilterOperator[] = [FilterOperator.Equals, FilterOperator.NotEquals]
const AFTER_EVERY_KIND: readonly FilterOperator[] = [
  FilterOperator.InList,
  FilterOperator.IsNull,
  FilterOperator.IsNotNull,
]
const TEXT_OPERATORS: readonly FilterOperator[] = [...TEXT_SEARCH]
const ORDER_OPERATORS: readonly FilterOperator[] = [
  FilterOperator.Less,
  FilterOperator.LessOrEqual,
  FilterOperator.Greater,
  FilterOperator.GreaterOrEqual,
  FilterOperator.Between,
]
const KIND_OPERATORS: ReadonlyMap<ColumnKind, readonly FilterOperator[]> = new Map([
  [ColumnKind.Number, ORDER_OPERATORS],
  [ColumnKind.Temporal, ORDER_OPERATORS],
  [ColumnKind.Boolean, []],
])

const LABELS: ReadonlyMap<FilterOperator, string> = new Map([
  [FilterOperator.Equals, '='],
  [FilterOperator.NotEquals, '≠'],
  [FilterOperator.Contains, 'contains'],
  [FilterOperator.NotContains, 'does not contain'],
  [FilterOperator.StartsWith, 'starts with'],
  [FilterOperator.EndsWith, 'ends with'],
  [FilterOperator.Less, '<'],
  [FilterOperator.LessOrEqual, '≤'],
  [FilterOperator.Greater, '>'],
  [FilterOperator.GreaterOrEqual, '≥'],
  [FilterOperator.Between, 'between'],
  [FilterOperator.InList, 'in'],
  [FilterOperator.IsNull, 'is null'],
  [FilterOperator.IsNotNull, 'is not null'],
])

export function isFilterOperator(value: unknown): value is FilterOperator {
  return typeof value === 'string' && OPERATORS.has(value)
}

export function operatorLabel(operator: FilterOperator): string {
  return LABELS.get(operator) ?? operator
}

// What the filter of a column offers for its kind: equality, NULL and lists for every column, text
// searches for text, ranges for numbers and dates. A column with a fixed list of values (an enum)
// is compared with them.
export function operatorsFor(kind: ColumnKind, hasChoices: boolean): FilterOperator[] {
  const extra = hasChoices ? [] : (KIND_OPERATORS.get(kind) ?? TEXT_OPERATORS)
  return [...EVERY_KIND, ...extra, ...AFTER_EVERY_KIND]
}

// The operator a new filter starts with.
export function defaultOperator(kind: ColumnKind, hasChoices: boolean): FilterOperator {
  if (hasChoices) {
    return FilterOperator.InList
  }
  return operatorsFor(kind, false).includes(FilterOperator.Contains)
    ? FilterOperator.Contains
    : FilterOperator.Equals
}

export interface ValueRange {
  readonly min: number
  readonly max: number
}

// How many values the operator takes: none, one, two (a range), or a list of one or more.
export function valueRange(operator: FilterOperator): ValueRange {
  if (NO_VALUE.has(operator)) {
    return { min: 0, max: 0 }
  }
  if (operator === FilterOperator.InList) {
    return { min: 1, max: Number.POSITIVE_INFINITY }
  }
  const count = operator === FilterOperator.Between ? RANGE_VALUES : 1
  return { min: count, max: count }
}

// A filter applies once it has the values its operator takes; a text search needs some text.
export function isCompleteFilter(filter: Pick<ColumnFilter, 'operator' | 'values'>): boolean {
  const { min, max } = valueRange(filter.operator)
  const count = filter.values.length
  return (
    count >= min &&
    count <= max &&
    !(TEXT_SEARCH.has(filter.operator) && filter.values.includes(''))
  )
}

export function isTextSearch(operator: FilterOperator): boolean {
  return TEXT_SEARCH.has(operator)
}

// "between 1 and 5", "in (a, b)", "contains 'x'", "is null": the condition after the column name.
export function describeFilter(filter: Pick<ColumnFilter, 'operator' | 'values'>): string {
  const label = operatorLabel(filter.operator)
  const quoted = filter.values.map((value) => `'${value}'`)
  if (filter.operator === FilterOperator.Between) {
    return `${label} ${quoted.join(' and ')}`
  }
  if (filter.operator === FilterOperator.InList) {
    return `${label} (${quoted.join(', ')})`
  }
  return [label, ...quoted].join(' ')
}

// What a condition being typed applies: one with the values of its operator, where an empty value
// only counts as the empty text of a text column compared for equality or listed.
export function isAppliedDraft(
  filter: Pick<ColumnFilter, 'operator' | 'values'>,
  kind: ColumnKind,
): boolean {
  if (!isCompleteFilter(filter)) {
    return false
  }
  return (
    !filter.values.includes('') ||
    (kind === ColumnKind.Text && TAKES_EMPTY_TEXT.has(filter.operator))
  )
}

// The condition with another operator, keeping the values typed that it still takes: an empty one
// for each value it needs, the values given for a list.
export function withOperator(
  filter: Pick<ColumnFilter, 'operator' | 'values'>,
  operator: FilterOperator,
): Pick<ColumnFilter, 'operator' | 'values'> {
  const { min, max } = valueRange(operator)
  if (max > RANGE_VALUES) {
    return { operator, values: filter.values.filter((value) => value !== '') }
  }
  return {
    operator,
    values: Array.from({ length: min }, (...[, index]) => filter.values.at(index) ?? ''),
  }
}
