import { describe, expect, it } from 'vitest'

import { ORDERS_RESULT } from '../../../test/fixtures/tables.ts'
import type { CellBlock } from '../results/protocol.ts'
import { ResultSet } from '../results/result-set.ts'
import { EditKind } from './edit-kind.ts'
import { editTargets, type TargetSource } from './edit-targets.ts'
import { addRow, deleteRow, NO_EDITS, type PendingEdits, PendingKind, setCell } from './pending.ts'

function source(edits: PendingEdits = NO_EDITS, columnCount = 3): TargetSource {
  const rows = new ResultSet({
    values: [],
    id: 't',
    sql: 'SELECT',
    kind: 'rows',
    canServerView: false,
    canRefresh: false,
  })
  rows.describe(ORDERS_RESULT)
  rows.addRows([[10], [11], [12], [13]])
  rows.applyView({ sort: [{ column: 0, isDescending: true }], filters: [] })
  return { rows, edits, columnCount }
}

function range(
  rows: readonly [number, number],
  columns: readonly [number, number] = [0, 0],
): CellBlock {
  const count = columns[1] - columns[0] + 1
  return {
    firstRow: rows[0],
    lastRow: rows[1],
    columns: Array.from({ length: count }, (...[, offset]) => columns[0] + offset),
  }
}

const TWO_NEW = addRow(addRow(NO_EDITS, new Map()), new Map())

describe('editTargets', () => {
  it('should act on the columns of a block in the order the grid shows them, each once', () => {
    expect(
      editTargets(
        {
          kind: EditKind.SetNull,
          block: { firstRow: 0, lastRow: 0, columns: [1, 0, 9, 1] },
          input: '',
        },
        source(),
      ),
    ).toStrictEqual({
      cells: [
        { row: { isNew: false, index: 3 }, column: 1 },
        { row: { isNew: false, index: 3 }, column: 0 },
      ],
    })
  })

  it('should act on no cell without a range', () => {
    expect(editTargets({ kind: EditKind.Insert, block: null, input: '' }, source())).toStrictEqual({
      cells: [],
    })
  })

  it('should name the rows of the result the view shows, and the columns of the range', () => {
    expect(
      editTargets({ kind: EditKind.SetNull, block: range([0, 1], [1, 9]), input: '' }, source()),
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
      editTargets({ kind: EditKind.Set, block: range([3, 7]), input: 'x' }, source(TWO_NEW)),
    ).toEqual({
      cells: [
        { row: { isNew: false, index: 0 }, column: 0 },
        { row: { isNew: true, id: 1 }, column: 0 },
        { row: { isNew: true, id: 2 }, column: 0 },
      ],
    })
  })

  it.each([EditKind.Delete, EditKind.Duplicate])('should name each row once to %s it', (kind) => {
    expect(editTargets({ kind, block: range([1, 2], [2, 5]), input: '' }, source())).toEqual({
      cells: [
        { row: { isNew: false, index: 2 }, column: 0 },
        { row: { isNew: false, index: 1 }, column: 0 },
      ],
    })
  })

  it('should name no cell past the columns of the result', () => {
    expect(
      editTargets({ kind: EditKind.Set, block: range([0, 0], [3, 4]), input: 'x' }, source()),
    ).toEqual({
      cells: [],
    })
  })

  it('should refuse more than 1,000 rows, except to revert them', () => {
    expect(
      editTargets({ kind: EditKind.SetNull, block: range([0, 1000]), input: '' }, source()),
    ).toEqual({
      problem: 'Select at most 1,000 rows to change at a time.',
    })
    expect(
      editTargets({ kind: EditKind.SetNull, block: range([0, 999]), input: '' }, source()),
    ).toHaveProperty('cells')
    expect(
      editTargets({ kind: EditKind.Revert, block: range([0, 5000]), input: '' }, source()),
    ).toEqual({
      cells: [],
    })
    expect(
      editTargets({ kind: EditKind.SetNull, block: range([600, 700]), input: '' }, source()),
    ).toEqual({ cells: [] })
  })

  it('should revert the new rows the range shows', () => {
    expect(
      editTargets({ kind: EditKind.Revert, block: range([5, 5]), input: '' }, source(TWO_NEW)),
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
        { kind: EditKind.Revert, block: range([1, 4], [0, 1]), input: '' },
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
      editTargets({ kind: EditKind.Revert, block: range([2, 2]), input: '' }, source(edits)),
    ).toEqual({
      cells: [],
    })
  })
})
