import { describe, expect, it } from 'vitest'

import { ColumnKind } from '../core/engine/query.ts'
import {
  ariaColumnIndex,
  ariaRowIndex,
  cellId,
  filterButtonId,
  HEADER_HEIGHT,
  initialWidth,
  pairs,
  ROW_HEIGHT,
  rowNumberWidth,
  scrollToShow,
} from './grid-model.ts'

describe('grid model', () => {
  it('should size columns from their names and the tools of their header, numbers narrower, within bounds', () => {
    expect(initialWidth({ name: 'x', dataType: 'INT8', kind: ColumnKind.Number })).toBe(104)
    expect(initialWidth({ name: 'x', dataType: 'TEXT', kind: ColumnKind.Text })).toBe(120)
    expect(
      initialWidth({ name: 'a_longer_column_name', dataType: 'TEXT', kind: ColumnKind.Text }),
    ).toBe(256)
    expect(initialWidth({ name: 'x'.repeat(100), dataType: 'TEXT', kind: ColumnKind.Text })).toBe(
      320,
    )
  })

  it('should make the row numbers as wide as the largest, three digits at least', () => {
    expect(rowNumberWidth(0)).toBe(40)
    expect(rowNumberWidth(999)).toBe(40)
    expect(rowNumberWidth(1000)).toBe(48)
    expect(rowNumberWidth(27_000_000)).toBe(80)
  })

  it('should name cells and filters, and count rows and columns like the grid pattern', () => {
    expect(cellId('t', 3, 4)).toBe('cell-t-3-4')
    expect(filterButtonId('t', 2)).toBe('filter-t-2')
    expect(ariaRowIndex(0)).toBe(2)
    expect(ariaColumnIndex(0)).toBe(2)
    expect(HEADER_HEIGHT).toBeGreaterThan(ROW_HEIGHT)
  })

  it('should pair the items of two lists, as many as the shorter one has', () => {
    expect(pairs(['a', 'b', 'c'], [1, 2])).toStrictEqual([
      ['a', 1],
      ['b', 2],
    ])
    expect(pairs(['a'], [1, 2])).toStrictEqual([['a', 1]])
    expect(pairs([], [1])).toStrictEqual([])
  })

  it('should scroll as little as possible to show a column', () => {
    const view = { start: 100, size: 300 }

    expect(scrollToShow(view, { start: 50, size: 80 })).toBe(50)
    expect(scrollToShow(view, { start: 150, size: 80 })).toBe(100)
    expect(scrollToShow(view, { start: 380, size: 80 })).toBe(160)
    expect(scrollToShow({ start: 100, size: 300 }, { start: 150, size: 500 })).toBe(150)
    expect(scrollToShow({ start: 0, size: 100 }, { start: 50, size: 30 })).toBe(0)
    expect(scrollToShow({ start: 0, size: 100 }, { start: 50, size: 100 })).toBe(50)
  })
})
