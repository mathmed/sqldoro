import { describe, expect, it } from 'vitest'

import { ColumnKind } from '../core/engine/query.ts'
import {
  ariaRowIndex,
  cellId,
  HEADER_HEIGHT,
  initialWidth,
  ROW_HEIGHT,
  scrollToShow,
} from './grid-model.ts'

describe('grid model', () => {
  it('should size columns from their names, numbers narrower, within bounds', () => {
    expect(initialWidth({ name: 'id', dataType: 'INT8', kind: ColumnKind.Number })).toBe(90)
    expect(initialWidth({ name: 'id', dataType: 'TEXT', kind: ColumnKind.Text })).toBe(120)
    expect(
      initialWidth({ name: 'a_longer_column_name', dataType: 'TEXT', kind: ColumnKind.Text }),
    ).toBe(200)
    expect(initialWidth({ name: 'x'.repeat(100), dataType: 'TEXT', kind: ColumnKind.Text })).toBe(
      320,
    )
  })

  it('should name cells and count rows like the grid pattern', () => {
    expect(cellId('t', 3, 4)).toBe('cell-t-3-4')
    expect(ariaRowIndex(0)).toBe(2)
    expect(HEADER_HEIGHT).toBe(2 * ROW_HEIGHT)
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
