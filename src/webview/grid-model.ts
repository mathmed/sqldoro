import { ColumnKind, type ResultColumn } from '../core/engine/query.ts'

// Every row has the same height: the grid places a million of them without measuring any.
export const ROW_HEIGHT = 24
// The header stays on top of the rows (styles.css gives it this height).
export const HEADER_HEIGHT = 28

const CHARACTER_WIDTH = 8
// Room for the icon of the kind, the arrow of a sort, the filter and the menu of the header.
const HEADER_EXTRAS = 96
const MIN_WIDTH = 90
const MIN_TEXT_WIDTH = 120
const MAX_WIDTH = 320
// The row numbers: as wide as the largest one, three digits at least.
const MIN_ROW_DIGITS = 3
const ROW_NUMBER_PADDING = 16

// A first width from the name and the kind of the column; the user resizes from there.
export function initialWidth(column: ResultColumn): number {
  const floor = column.kind === ColumnKind.Number ? MIN_WIDTH : MIN_TEXT_WIDTH
  return Math.min(Math.max(column.name.length * CHARACTER_WIDTH + HEADER_EXTRAS, floor), MAX_WIDTH)
}

// The width of the column of row numbers, for the rows of the grid.
export function rowNumberWidth(rowCount: number): number {
  const digits = Math.max(String(rowCount).length, MIN_ROW_DIGITS)
  return digits * CHARACTER_WIDTH + ROW_NUMBER_PADDING
}

export function cellId(tabId: string, row: number, column: number): string {
  return `cell-${tabId}-${String(row)}-${String(column)}`
}

// The filter button of a column's header, which its filter opens under and gives the focus back to.
export function filterButtonId(tabId: string, column: number): string {
  return `filter-${tabId}-${String(column)}`
}

// Each item of a list with the item at the same place of another; the longer one's extra items go.
export function pairs<Left, Right>(
  left: readonly Left[],
  right: readonly Right[],
): (readonly [Left, Right])[] {
  return left.flatMap((item, index) => {
    const other = right.at(index)
    return other === undefined ? [] : [[item, other] as const]
  })
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
// The columns count from 1 too, the row numbers being the first: the columns of the result start
// at 2.
const FIRST_DATA_COLUMN_INDEX = 2

export function ariaRowIndex(row: number): number {
  return row + FIRST_DATA_ROW_INDEX
}

export function ariaColumnIndex(column: number): number {
  return column + FIRST_DATA_COLUMN_INDEX
}
