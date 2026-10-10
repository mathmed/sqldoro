import { describe, expect, it } from 'vitest'

import { ORDERS_RESULT } from '../../../test/fixtures/tables.ts'
import { ResultSet } from '../results/result-set.ts'
import { EditKind } from './edit-kind.ts'
import { editTargets, type TargetSource } from './edit-targets.ts'
import { addRow, deleteRow, NO_EDITS, type PendingEdits, PendingKind, setCell } from './pending.ts'

function source(edits: PendingEdits = NO_EDITS, columnCount = 3): TargetSource {
  const rows = new ResultSet({ id: 't', sql: 'SELECT', kind: 'rows', canServerView: false })
  rows.describe(ORDERS_RESULT)
  rows.addRows([[10], [11], [12], [13]])
  rows.applyView({ sort: [{ column: 0, isDescending: true }], filters: [] })
  return { rows, edits, columnCount }
}

interface Range {
  readonly firstRow: number
  readonly lastRow: number
  readonly firstColumn: number
  readonly lastColumn: number
}

function range(
  rows: readonly [number, number],
  columns: readonly [number, number] = [0, 0],
): Range {
  return { firstRow: rows[0], lastRow: rows[1], firstColumn: columns[0], lastColumn: columns[1] }
}

const TWO_NEW = addRow(addRow(NO_EDITS, new Map()), new Map())

describe('editTargets', () => {
  it('should act on no cell without a range', () => {
    expect(editTargets({ kind: EditKind.Insert, range: null, input: '' }, source())).toStrictEqual({
      cells: [],
    })
  })

  it('should name the rows of the result the view shows, and the columns of the range', () => {
    expect(
      editTargets({ kind: EditKind.SetNull, range: range([0, 1], [1, 9]), input: '' }, source()),
    ).toEqual({
      cells: [
        { row: { isNew: false, index: 3 }, column: 1 },
        { row: { isNew: false, index: 3 }, column: 2 },
        { row: { isNew: false, index: 2 }, column: 1 },
        { row: { isNew: false, index: 2 }, column: 2 },
      ],
    })
  })

  it('should name the new rows past the rows of the view, in order, and skip what is past them', () => {
    expect(
      editTargets({ kind: EditKind.Set, range: range([3, 7]), input: 'x' }, source(TWO_NEW)),
    ).toEqual({
      cells: [
        { row: { isNew: false, index: 0 }, column: 0 },
        { row: { isNew: true, id: 1 }, column: 0 },
        { row: { isNew: true, id: 2 }, column: 0 },
      ],
    })
  })

  it.each([EditKind.Delete, EditKind.Duplicate])('should name each row once to %s it', (kind) => {
    expect(editTargets({ kind, range: range([1, 2], [2, 5]), input: '' }, source())).toEqual({
      cells: [
        { row: { isNew: false, index: 2 }, column: 0 },
        { row: { isNew: false, index: 1 }, column: 0 },
      ],
    })
  })

  it('should name no cell past the columns of the result', () => {
    expect(
      editTargets({ kind: EditKind.Set, range: range([0, 0], [3, 4]), input: 'x' }, source()),
    ).toEqual({
      cells: [],
    })
  })

  it('should refuse more than 1,000 rows, except to revert them', () => {
    expect(
      editTargets({ kind: EditKind.SetNull, range: range([0, 1000]), input: '' }, source()),
    ).toEqual({
      problem: 'Select at most 1,000 rows to change at a time.',
    })
    expect(
      editTargets({ kind: EditKind.SetNull, range: range([0, 999]), input: '' }, source()),
    ).toHaveProperty('cells')
    expect(
      editTargets({ kind: EditKind.Revert, range: range([0, 5000]), input: '' }, source()),
    ).toEqual({
      cells: [],
    })
    expect(
      editTargets({ kind: EditKind.SetNull, range: range([600, 700]), input: '' }, source()),
    ).toEqual({ cells: [] })
  })

  it('should revert the new rows the range shows', () => {
    expect(
      editTargets({ kind: EditKind.Revert, range: range([5, 5]), input: '' }, source(TWO_NEW)),
    ).toEqual({
      cells: [{ row: { isNew: true, id: 2 }, column: 0 }],
    })
  })

  it('should revert only the rows of the range that have changes', () => {
    const text = { kind: PendingKind.Text, text: 'x' } as const
    const edits = addRow(
      deleteRow(
        setCell(NO_EDITS, {
          row: { isNew: false, index: 0 },
          column: 1,
          value: text,
          original: null,
        }),
        { isNew: false, index: 2 },
      ),
      new Map(),
    )

    expect(
      editTargets(
        { kind: EditKind.Revert, range: range([1, 4], [0, 1]), input: '' },
        source(edits),
      ),
    ).toEqual({
      cells: [
        { row: { isNew: false, index: 2 }, column: 0 },
        { row: { isNew: false, index: 2 }, column: 1 },
        { row: { isNew: false, index: 0 }, column: 0 },
        { row: { isNew: false, index: 0 }, column: 1 },
        { row: { isNew: true, id: 1 }, column: 0 },
        { row: { isNew: true, id: 1 }, column: 1 },
      ],
    })
    expect(
      editTargets({ kind: EditKind.Revert, range: range([2, 2]), input: '' }, source(edits)),
    ).toEqual({
      cells: [],
    })
  })
})
