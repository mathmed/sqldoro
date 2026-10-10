import { useVirtualizer } from '@tanstack/react-virtual'
import { type RefObject, useEffect } from 'react'

// The columns on each side of those in view that exist in the page too, for a smooth scroll.
const COLUMN_OVERSCAN = 3
// Before the page is laid out, the grid assumes this size; the real one replaces it at once.
const INITIAL_RECT = { width: 800, height: 600 }

// The columns of the grid in the page: from `first` to `last`, after empty space as wide as the
// columns before `first`.
export interface ColumnWindow {
  readonly first: number
  readonly last: number
  readonly before: number
}

// Only the columns in view (and a few around) exist in the page, like the rows: a result with a
// thousand columns scrolls as smoothly as one with ten.
export function useColumnWindow(
  widths: readonly number[],
  scrollRef: RefObject<HTMLDivElement | null>,
): ColumnWindow {
  // eslint-disable-next-line react-hooks/incompatible-library -- sqldoro does not use the React Compiler: nothing memoizes the virtualizer's functions
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: widths.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => columnWidth(widths, index),
    overscan: COLUMN_OVERSCAN,
    initialRect: INITIAL_RECT,
  })
  // A column resized or a new result: the virtualizer reads the widths again.
  const sizes = widths.join(' ')
  useEffect(() => {
    virtualizer.measure()
  }, [sizes, virtualizer])
  return columnWindow(
    virtualizer.getVirtualItems().map((item) => item.index),
    widths,
  )
}

// The width of a column; nothing past the last one.
export function columnWidth(widths: readonly number[], index: number): number {
  return widths.slice(index, index + 1).reduce((sum, width) => sum + width, 0)
}

export function columnWindow(indexes: readonly number[], widths: readonly number[]): ColumnWindow {
  const first = indexes.at(0) ?? 0
  return {
    first,
    last: indexes.at(-1) ?? -1,
    before: widths.slice(0, first).reduce((sum, width) => sum + width, 0),
  }
}
