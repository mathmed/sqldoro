import { type CellValue, ColumnKind, type ResultColumn, type Row } from '../engine/query.ts'
import { cellText } from './cells.ts'
import { compareNumericKeys, type NumericKey, numericKey } from './decimal.ts'

export interface SortKey {
  readonly column: number
  readonly isDescending: boolean
}

export interface ColumnFilter {
  readonly column: number
  readonly text: string
}

// How the rows of a result are shown: filtered by every filter, then sorted by the keys in order.
export interface ViewSpec {
  readonly sort: readonly SortKey[]
  readonly filters: readonly ColumnFilter[]
}

export const IDENTITY_VIEW: ViewSpec = { sort: [], filters: [] }

type SortValue = NumericKey | string | null

// Natural order with a fixed locale: the same on every machine.
const COLLATOR = new Intl.Collator('en', { numeric: true })

export function activeFilters(spec: ViewSpec): ColumnFilter[] {
  return spec.filters.filter((filter) => filter.text !== '')
}

export function isIdentityView(spec: ViewSpec): boolean {
  return spec.sort.length === 0 && activeFilters(spec).length === 0
}

// A filter matches the text of a value without case; NULL matches no filter.
export function matchesCell(value: CellValue, filter: string): boolean {
  return value !== null && cellText(value).toLowerCase().includes(filter.toLowerCase())
}

interface SortColumn {
  readonly key: SortKey
  readonly values: readonly SortValue[]
}

// The positions of the rows to show, in order. NULLs come last in both directions; equal rows keep
// the order the server sent them in.
export function applyView(
  rows: readonly Row[],
  columns: readonly ResultColumn[],
  spec: ViewSpec,
): number[] {
  const filters = activeFilters(spec)
  const shown = rows.flatMap((row, index) =>
    filters.every((filter) => matchesCell(row.at(filter.column) ?? null, filter.text))
      ? [index]
      : [],
  )
  const sortColumns = spec.sort.map((key) => ({
    key,
    values: rows.map((row) => sortValue(row.at(key.column) ?? null, kindOf(columns, key.column))),
  }))
  // Array#sort is stable: rows that compare equal (all of them without a sort) keep their order.
  return shown.sort((left, right) => compareRows(sortColumns, left, right))
}

function kindOf(columns: readonly ResultColumn[], column: number): ColumnKind {
  return columns.at(column)?.kind ?? ColumnKind.Other
}

function sortValue(value: CellValue, kind: ColumnKind): SortValue {
  if (value === null) {
    return null
  }
  return kind === ColumnKind.Number && typeof value !== 'boolean'
    ? numericKey(value)
    : cellText(value)
}

function compareRows(sortColumns: readonly SortColumn[], left: number, right: number): number {
  for (const { key, values } of sortColumns) {
    const order = compareSortValues(values.at(left) ?? null, values.at(right) ?? null, key)
    if (order !== 0) {
      return order
    }
  }
  return 0
}

function compareSortValues(left: SortValue, right: SortValue, key: SortKey): number {
  if (left === null || right === null) {
    return Number(left === null) - Number(right === null)
  }
  const order = compareValues(left, right)
  return key.isDescending ? -order : order
}

function compareValues(left: NumericKey | string, right: NumericKey | string): number {
  if (typeof left === 'string' || typeof right === 'string') {
    return COLLATOR.compare(textOf(left), textOf(right))
  }
  return compareNumericKeys(left, right)
}

function textOf(value: NumericKey | string): string {
  return typeof value === 'string' ? value : value.text
}
