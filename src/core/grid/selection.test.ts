import { describe, expect, it } from 'vitest'

import {
  clampPosition,
  clampSelection,
  extendSelection,
  isSelected,
  type Move,
  Moves,
  moveSelection,
  selectAll,
  selectCell,
  selectionRange,
} from './selection.ts'

const BOUNDS = { rowCount: 100, columnCount: 5, pageSize: 10 }
const MIDDLE = selectCell({ row: 50, column: 2 })

function moved(move: Move, isExtending = false, from = MIDDLE): string {
  const { anchor, focus } = moveSelection(from, { move, isExtending }, BOUNDS)
  return `${String(anchor.row)},${String(anchor.column)} ${String(focus.row)},${String(focus.column)}`
}

describe('moveSelection', () => {
  it.each([
    ['up', Moves.up, '49,2 49,2'],
    ['down', Moves.down, '51,2 51,2'],
    ['left', Moves.left, '50,1 50,1'],
    ['right', Moves.right, '50,3 50,3'],
    ['rowStart', Moves.rowStart, '50,0 50,0'],
    ['rowEnd', Moves.rowEnd, '50,4 50,4'],
    ['pageUp', Moves.pageUp, '40,2 40,2'],
    ['pageDown', Moves.pageDown, '60,2 60,2'],
    ['gridStart', Moves.gridStart, '0,0 0,0'],
    ['gridEnd', Moves.gridEnd, '99,4 99,4'],
  ] as const)('should move %s', (...[, move, expected]) => {
    expect(moved(move)).toBe(expected)
  })

  it('should keep the anchor when extending', () => {
    expect(moved(Moves.down, true)).toBe('50,2 51,2')
    expect(moved(Moves.pageUp, true, extendSelection(MIDDLE, { row: 45, column: 4 }))).toBe(
      '50,2 35,4',
    )
  })

  it('should stay inside the grid', () => {
    expect(moved(Moves.up, false, selectCell({ row: 0, column: 0 }))).toBe('0,0 0,0')
    expect(moved(Moves.left, false, selectCell({ row: 0, column: 0 }))).toBe('0,0 0,0')
    expect(moved(Moves.pageDown, false, selectCell({ row: 95, column: 4 }))).toBe('99,4 99,4')
    expect(moved(Moves.right, false, selectCell({ row: 95, column: 4 }))).toBe('95,4 95,4')
  })
})

describe('clampPosition and clampSelection', () => {
  it('should bring positions back inside the grid, and to the first cell of an empty grid', () => {
    expect(clampPosition({ row: 200, column: -3 }, BOUNDS)).toStrictEqual({ row: 99, column: 0 })
    expect(
      clampPosition({ row: 5, column: 5 }, { rowCount: 0, columnCount: 0, pageSize: 1 }),
    ).toStrictEqual({ row: 0, column: 0 })
  })

  it('should clamp both ends of a selection', () => {
    expect(
      clampSelection({ anchor: { row: 120, column: 1 }, focus: { row: 3, column: 9 } }, BOUNDS),
    ).toStrictEqual({ anchor: { row: 99, column: 1 }, focus: { row: 3, column: 4 } })
  })
})

describe('selectAll', () => {
  it('should select from the first to the last cell', () => {
    expect(selectAll(BOUNDS)).toStrictEqual({
      anchor: { row: 0, column: 0 },
      focus: { row: 99, column: 4 },
    })
  })
})

describe('selectionRange and isSelected', () => {
  const range = selectionRange({ anchor: { row: 8, column: 3 }, focus: { row: 2, column: 1 } })

  it('should order the ends of the selection', () => {
    expect(range).toStrictEqual({ firstRow: 2, lastRow: 8, firstColumn: 1, lastColumn: 3 })
  })

  it('should tell the cells inside the range, both ends included', () => {
    expect(isSelected(range, { row: 2, column: 1 })).toBe(true)
    expect(isSelected(range, { row: 8, column: 3 })).toBe(true)
    expect(isSelected(range, { row: 1, column: 2 })).toBe(false)
    expect(isSelected(range, { row: 9, column: 2 })).toBe(false)
    expect(isSelected(range, { row: 5, column: 0 })).toBe(false)
    expect(isSelected(range, { row: 5, column: 4 })).toBe(false)
  })
})
