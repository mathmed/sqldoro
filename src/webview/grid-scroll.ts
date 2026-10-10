import { HEADER_HEIGHT, ROW_HEIGHT, scrollToShow } from './grid-model.ts'

// The columns as the grid lays them out: after the row numbers, each as wide as it is.
export interface ColumnLayout {
  readonly widths: readonly number[]
  readonly gutter: number
}

// Rows a page up or down moves by: as many as fit in the grid.
export function pageSize(element: HTMLElement): number {
  return Math.max(Math.floor((element.clientHeight - HEADER_HEIGHT) / ROW_HEIGHT), 1)
}

// The horizontal scroll that shows the column of the cell with the focus, beside the row numbers
// that stay on the left.
export function revealedScroll(
  element: HTMLElement,
  { widths, gutter }: ColumnLayout,
  column: number,
): number {
  const start = totalOf(widths.slice(0, column))
  const end = totalOf(widths.slice(0, column + 1))
  return scrollToShow(
    { start: element.scrollLeft, size: element.clientWidth - gutter },
    { start, size: end - start },
  )
}

function totalOf(widths: readonly number[]): number {
  return widths.reduce((sum, width) => sum + width, 0)
}
