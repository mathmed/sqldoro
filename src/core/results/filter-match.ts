import { type CellValue, ColumnKind } from '../engine/query.ts'
import { cellText } from './cells.ts'
import { type ColumnFilter, FilterOperator } from './conditions.ts'
import { compareNumericKeys, numericKey } from './decimal.ts'

type Present = boolean | number | string
type Test = (value: Present, operands: readonly string[], kind: ColumnKind) => boolean

// How booleans may be typed, as PostgreSQL reads them.
const TRUE_WORDS: ReadonlySet<string> = new Set(['true', 't', '1', 'yes', 'y', 'on'])
const FALSE_WORDS: ReadonlySet<string> = new Set(['false', 'f', '0', 'no', 'n', 'off'])

const TESTS: ReadonlyMap<FilterOperator, Test> = new Map<FilterOperator, Test>([
  [FilterOperator.Equals, (value, operands, kind) => compare(value, first(operands), kind) === 0],
  [
    FilterOperator.NotEquals,
    (value, operands, kind) => compare(value, first(operands), kind) !== 0,
  ],
  [
    FilterOperator.Contains,
    (value, operands) => lower(value).includes(first(operands).toLowerCase()),
  ],
  [
    FilterOperator.NotContains,
    (value, operands) => !lower(value).includes(first(operands).toLowerCase()),
  ],
  [
    FilterOperator.StartsWith,
    (value, operands) => lower(value).startsWith(first(operands).toLowerCase()),
  ],
  [
    FilterOperator.EndsWith,
    (value, operands) => lower(value).endsWith(first(operands).toLowerCase()),
  ],
  [FilterOperator.Less, (value, operands, kind) => compare(value, first(operands), kind) < 0],
  [
    FilterOperator.LessOrEqual,
    (value, operands, kind) => compare(value, first(operands), kind) <= 0,
  ],
  [FilterOperator.Greater, (value, operands, kind) => compare(value, first(operands), kind) > 0],
  [
    FilterOperator.GreaterOrEqual,
    (value, operands, kind) => compare(value, first(operands), kind) >= 0,
  ],
  [FilterOperator.Between, isBetween],
  [
    FilterOperator.InList,
    (value, operands, kind) => operands.some((operand) => compare(value, operand, kind) === 0),
  ],
  [FilterOperator.IsNotNull, () => true],
])

// Whether a value meets the filter of its column, in the extension host, as the server would tell:
// NULL meets only "is null"; numbers compare exactly (BIGINT and DECIMAL stay text), text searches
// ignore case, and dates and the rest compare as the server wrote them.
export function matchesFilter(value: CellValue, filter: ColumnFilter, kind: ColumnKind): boolean {
  if (value === null) {
    return filter.operator === FilterOperator.IsNull
  }
  return TESTS.get(filter.operator)?.(value, filter.values, kind) ?? false
}

function isBetween(value: Present, operands: readonly string[], kind: ColumnKind): boolean {
  return (
    compare(value, operandAt(operands, 0), kind) >= 0 &&
    compare(value, operandAt(operands, 1), kind) <= 0
  )
}

// What was typed for a value the filter takes; a filter is applied only with all of them.
function operandAt(operands: readonly string[], index: number): string {
  return operands.at(index) ?? ''
}

function first(operands: readonly string[]): string {
  return operandAt(operands, 0)
}

function lower(value: Present): string {
  return cellText(value).toLowerCase()
}

// The order of a value and what was typed: numbers by their exact value, booleans by their truth,
// anything else by its text.
function compare(value: Present, operand: string, kind: ColumnKind): number {
  if (typeof value === 'boolean') {
    return compareText(String(value), booleanText(operand))
  }
  if (kind === ColumnKind.Number || typeof value === 'number') {
    return compareNumericKeys(numericKey(value), numericKey(operand.trim()))
  }
  return compareText(value, operand)
}

function booleanText(operand: string): string {
  const word = operand.trim().toLowerCase()
  if (TRUE_WORDS.has(word)) {
    return 'true'
  }
  return FALSE_WORDS.has(word) ? 'false' : operand
}

function compareText(left: string, right: string): number {
  return Number(left > right) - Number(left < right)
}
