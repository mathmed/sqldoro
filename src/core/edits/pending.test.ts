import { describe, expect, it } from 'vitest'

import {
  addRow,
  changedRowCount,
  deleteRow,
  isOriginal,
  NO_EDITS,
  type PendingEdits,
  PendingKind,
  type PendingValue,
  revertAll,
  revertCell,
  type RowTarget,
  setCell,
} from './pending.ts'

const ROW_3: RowTarget = { isNew: false, index: 3 }
const ROW_5: RowTarget = { isNew: false, index: 5 }
const ANN: PendingValue = { kind: PendingKind.Text, text: 'ann' }
const BOB: PendingValue = { kind: PendingKind.Text, text: 'bob' }
const NULL: PendingValue = { kind: PendingKind.Null }
const DEFAULT: PendingValue = { kind: PendingKind.Default }

function cellsOf(edits: PendingEdits, index: number): [number, PendingValue][] {
  return [...(edits.rows.get(index)?.cells ?? [])]
}

describe('setCell', () => {
  it('should keep the new value of a cell of a row of the result', () => {
    const sut = setCell(NO_EDITS, { row: ROW_3, column: 1, value: ANN, original: 'zed' })

    expect(cellsOf(sut, 3)).toStrictEqual([[1, ANN]])
    expect(sut.rows.get(3)?.isDeleted).toBe(false)
    expect(NO_EDITS.rows.size).toBe(0)
  })

  it('should replace a value, and drop it once the cell holds what the row holds', () => {
    const changed = setCell(NO_EDITS, { row: ROW_3, column: 1, value: ANN, original: 'zed' })
    const again = setCell(changed, { row: ROW_3, column: 1, value: BOB, original: 'zed' })
    const back = setCell(again, { row: ROW_3, column: 1, value: ANN, original: 'ann' })

    expect(cellsOf(again, 3)).toStrictEqual([[1, BOB]])
    expect(back.rows.size).toBe(0)
  })

  it('should keep the other cells and rows as they are', () => {
    const first = setCell(NO_EDITS, { row: ROW_3, column: 1, value: ANN, original: null })
    const second = setCell(first, { row: ROW_3, column: 2, value: NULL, original: 'x' })
    const third = setCell(second, { row: ROW_5, column: 0, value: DEFAULT, original: 1 })
    const back = setCell(third, { row: ROW_3, column: 2, value: BOB, original: 'bob' })

    expect(cellsOf(third, 3)).toStrictEqual([
      [1, ANN],
      [2, NULL],
    ])
    expect(cellsOf(back, 3)).toStrictEqual([[1, ANN]])
    expect(cellsOf(back, 5)).toStrictEqual([[0, DEFAULT]])
  })

  it('should set the cells of the new row it names', () => {
    const rows = addRow(addRow(NO_EDITS, new Map()), new Map())
    const sut = setCell(rows, {
      row: { isNew: true, id: 2 },
      column: 1,
      value: ANN,
      original: 'ann',
    })

    expect(sut.newRows).toStrictEqual([
      { id: 1, cells: new Map() },
      { id: 2, cells: new Map([[1, ANN]]) },
    ])
  })
})

describe('isOriginal', () => {
  it.each([
    [ANN, 'ann', true],
    [ANN, 'Ann', false],
    [ANN, null, false],
    [{ kind: PendingKind.Text, text: '42' }, 42, true],
    [{ kind: PendingKind.Text, text: 'false' }, false, true],
    [{ kind: PendingKind.Text, text: 'null' }, null, false],
    [NULL, null, true],
    [NULL, '', false],
    [DEFAULT, null, false],
    [DEFAULT, 'x', false],
  ] as const)('should tell whether %j is what %j holds: %s', (value, original, isSame) => {
    expect(isOriginal(value, original)).toBe(isSame)
  })
})

describe('revertCell', () => {
  it('should drop the value of a cell of a row of the result', () => {
    const changed = setCell(NO_EDITS, { row: ROW_3, column: 1, value: ANN, original: null })
    const both = setCell(changed, { row: ROW_3, column: 2, value: BOB, original: null })

    expect(cellsOf(revertCell(both, ROW_3, 1), 3)).toStrictEqual([[2, BOB]])
    expect(revertCell(changed, ROW_3, 1).rows.size).toBe(0)
  })

  it('should bring a deleted row back before it drops its values', () => {
    const changed = setCell(NO_EDITS, { row: ROW_3, column: 1, value: ANN, original: null })
    const deleted = deleteRow(changed, ROW_3)

    const sut = revertCell(deleted, ROW_3, 1)

    expect(sut.rows.get(3)).toStrictEqual({ cells: new Map([[1, ANN]]), isDeleted: false })
    expect(revertCell(deleteRow(NO_EDITS, ROW_5), ROW_5, 0).rows.size).toBe(0)
  })

  it('should give a cell of a new row its default back', () => {
    const added = addRow(
      NO_EDITS,
      new Map([
        [1, ANN],
        [2, BOB],
      ]),
    )

    expect(revertCell(added, { isNew: true, id: 1 }, 1).newRows).toStrictEqual([
      { id: 1, cells: new Map([[2, BOB]]) },
    ])
  })
})

describe('deleteRow', () => {
  it('should mark a row of the result, keeping its values', () => {
    const changed = setCell(NO_EDITS, { row: ROW_3, column: 1, value: ANN, original: null })

    expect(deleteRow(changed, ROW_3).rows.get(3)).toStrictEqual({
      cells: new Map([[1, ANN]]),
      isDeleted: true,
    })
    expect(deleteRow(NO_EDITS, ROW_5).rows.get(5)).toStrictEqual({
      cells: new Map(),
      isDeleted: true,
    })
  })

  it('should drop a new row', () => {
    const added = addRow(addRow(NO_EDITS, new Map()), new Map([[0, ANN]]))

    expect(deleteRow(added, { isNew: true, id: 1 }).newRows).toStrictEqual([
      { id: 2, cells: new Map([[0, ANN]]) },
    ])
  })
})

describe('addRow and revertAll', () => {
  it('should never give two new rows the same id', () => {
    const added = addRow(addRow(NO_EDITS, new Map()), new Map())
    const reverted = revertAll(
      setCell(added, { row: ROW_3, column: 0, value: ANN, original: null }),
    )

    expect(added.newRows.map(({ id }) => id)).toStrictEqual([1, 2])
    expect(added.nextId).toBe(3)
    expect(reverted).toStrictEqual({ rows: new Map(), newRows: [], nextId: 3 })
    expect(addRow(reverted, new Map()).newRows.map(({ id }) => id)).toStrictEqual([3])
  })

  it('should count the rows with changes', () => {
    const changed = setCell(NO_EDITS, { row: ROW_3, column: 0, value: ANN, original: null })

    expect(changedRowCount(NO_EDITS)).toBe(0)
    expect(changedRowCount(addRow(deleteRow(changed, ROW_5), new Map()))).toBe(3)
  })
})
