import { ColumnKind, type ResultColumn } from '../core/engine/query.ts'

// Every row has the same height: the grid places a million of them without measuring any.
export const ROW_HEIGHT = 24
// The header row and the filter row stay on top of the rows (styles.css gives them this height).
const HEADER_ROWS = 2
export const HEADER_HEIGHT = HEADER_ROWS * ROW_HEIGHT

const CHARACTER_WIDTH = 8
const CELL_PADDING = 40
const MIN_WIDTH = 90
const MIN_TEXT_WIDTH = 120
const MAX_WIDTH = 320

// A first width from the name and the kind of the column; the user resizes from there.
export function initialWidth(column: ResultColumn): number {
  const floor = column.kind === ColumnKind.Number ? MIN_WIDTH : MIN_TEXT_WIDTH
  return Math.min(Math.max(column.name.length * CHARACTER_WIDTH + CELL_PADDING, floor), MAX_WIDTH)
}

export function cellId(tabId: string, row: number, column: number): string {
  return `cell-${tabId}-${String(row)}-${String(column)}`
}

export interface Span {
  readonly start: number
  readonly size: number
}

// The horizontal scroll that shows the whole column, moving as little as possible; a column wider
// than the view shows its start.
export function scrollToShow(view: Span, column: Span): number {
  if (column.start < view.start || column.size >= view.size) {
    return column.start
  }
  const end = column.start + column.size
  return end > view.start + view.size ? end - view.size : view.start
}

// The rows of the grid count from 1, the header being the first: data rows start at 2.
const FIRST_DATA_ROW_INDEX = 2

export function ariaRowIndex(row: number): number {
  return row + FIRST_DATA_ROW_INDEX
}
