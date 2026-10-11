import type { ResultColumn, Row } from '../engine/query.ts'
import { cellText } from './cells.ts'

export interface ProjectedRows {
  readonly columns: readonly ResultColumn[]
  readonly rows: readonly Row[]
}

export interface DistinctValues {
  readonly values: readonly string[]
  // False when the rows hold more values than the list.
  readonly isComplete: boolean
}

// These columns of the rows, in this order: what is copied and exported, as the grid shows it.
export function projectRows(
  columns: readonly ResultColumn[],
  { rows, positions }: { readonly rows: readonly Row[]; readonly positions: readonly number[] },
): ProjectedRows {
  const kept = positions.filter((position) => position >= 0 && position < columns.length)
  return {
    columns: kept.flatMap((position) => columns.slice(position, position + 1)),
    rows: rows.map((row) => kept.map((position) => row.at(position) ?? null)),
  }
}

// The values of a column in the rows, each once, in natural order, as the filter of the column
// offers them; NULL is a filter of its own.
export function distinctValues(rows: readonly Row[], column: number, max: number): DistinctValues {
  const values = new Set<string>()
  for (const row of rows) {
    const value = row.at(column) ?? null
    if (value !== null) {
      values.add(cellText(value))
    }
  }
  const sorted = [...values].toSorted(new Intl.Collator('en', { numeric: true }).compare)
  return { values: sorted.slice(0, max), isComplete: sorted.length <= max }
}
