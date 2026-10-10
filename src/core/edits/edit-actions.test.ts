import { describe, expect, it } from 'vitest'

import { ORDERS, ORDERS_RESULT, tableColumn } from '../../../test/fixtures/tables.ts'
import type { Row } from '../engine/query.ts'
import { ValueType } from '../engine/table.ts'
import {
  applyEdit,
  type CellTarget,
  type EditAction,
  type EditContext,
  MAX_CHANGED_ROWS,
} from './edit-actions.ts'
import { EditKind } from './edit-kind.ts'
import { type EditableTable, editableTable } from './editability.ts'
import { NO_EDITS, type PendingEdits, PendingKind, type RowTarget } from './pending.ts'

// id, code, note, total, payload, placed_at, total_cents
const ROWS: readonly Row[] = [
  [1, 'A-1', null, '12.50', '{"a": 1}', '2026-01-02 03:04:05+00', 1250],
  [2, 'A-2', 'gift', null, null, '2026-01-03 03:04:05+00', null],
]

function tableOf(description = ORDERS): EditableTable {
  const editability = editableTable({
    reference: { parts: ['orders'] },
    columns: ORDERS_RESULT,
    description,
  })
  if (!('table' in editability)) {
    throw new Error(editability.problem)
  }
  return editability.table
}

const CONTEXT: EditContext = { table: tableOf(), original: (index) => ROWS.at(index) }

function row(index: number): RowTarget {
  return { isNew: false, index }
}

function cell(target: RowTarget, column: number): CellTarget {
  return { row: target, column }
}

interface Edit {
  readonly kind: EditAction['kind']
  readonly cells?: readonly CellTarget[]
  readonly input?: string
}

function act(edits: PendingEdits, edit: Edit, context = CONTEXT): ReturnType<typeof applyEdit> {
  return applyEdit(edits, { cells: [], input: '', ...edit }, context)
}

function edited(edits: PendingEdits, edit: Edit): PendingEdits {
  const outcome = act(edits, edit)
  expect(outcome.problem).toBe('')
  return outcome.edits
}

describe('applyEdit', () => {
  describe('values', () => {
    it('should keep a typed value as the column reads it', () => {
      const sut = edited(NO_EDITS, { kind: EditKind.Set, cells: [cell(row(0), 3)], input: '13.75' })

      expect(sut.rows.get(0)?.cells.get(3)).toStrictEqual({ kind: PendingKind.Text, text: '13.75' })
    })

    it('should refuse a value the column cannot hold exactly, changing nothing', () => {
      const outcome = act(NO_EDITS, {
        kind: EditKind.Set,
        cells: [cell(row(0), 3)],
        input: '1.234',
      })

      expect(outcome).toStrictEqual({
        edits: NO_EDITS,
        problem: 'total: Type a number with at most 8 digits before the point and 2 after it.',
      })
    })

    it('should set every cell, or none', () => {
      const cells = [cell(row(0), 2), cell(row(1), 2), cell(row(1), 3)]

      expect(act(NO_EDITS, { kind: EditKind.Set, cells, input: 'gift' }).problem).toMatch(
        /^total: /,
      )
      expect(
        edited(NO_EDITS, { kind: EditKind.Set, cells: cells.slice(0, 2), input: 'gift' }).rows.size,
      ).toBe(1)
    })

    it.each([
      [cell(row(0), 6), 'total_cents: The server computes this column.'],
      [cell(row(0), 99), 'This column is not in the result.'],
      [cell(row(9), 2), 'This row is no longer in the result.'],
      [cell({ isNew: true, id: 4 }, 2), 'This row is no longer in the result.'],
    ])('should refuse to set %j', (target, problem) => {
      expect(act(NO_EDITS, { kind: EditKind.Set, cells: [target], input: 'x' })).toStrictEqual({
        edits: NO_EDITS,
        problem,
      })
    })

    it('should refuse to change a row marked for deletion', () => {
      const deleted = edited(NO_EDITS, { kind: EditKind.Delete, cells: [cell(row(1), 0)] })

      expect(
        act(deleted, { kind: EditKind.Set, cells: [cell(row(1), 2)], input: 'x' }).problem,
      ).toBe('This row is marked for deletion: revert the deletion to change it.')
      expect(
        act(deleted, { kind: EditKind.Set, cells: [cell(row(0), 2)], input: 'x' }).problem,
      ).toBe('')
    })

    it('should set NULL where the column takes it', () => {
      const sut = edited(NO_EDITS, { kind: EditKind.SetNull, cells: [cell(row(1), 2)] })

      expect(sut.rows.get(1)?.cells.get(2)).toStrictEqual({ kind: PendingKind.Null })
      expect(act(NO_EDITS, { kind: EditKind.SetNull, cells: [cell(row(1), 1)] }).problem).toBe(
        'code: It cannot be NULL.',
      )
    })

    it('should set the default where the column has one', () => {
      const sut = edited(NO_EDITS, { kind: EditKind.SetDefault, cells: [cell(row(0), 5)] })

      expect(sut.rows.get(0)?.cells.get(5)).toStrictEqual({ kind: PendingKind.Default })
      expect(act(NO_EDITS, { kind: EditKind.SetDefault, cells: [cell(row(0), 1)] }).problem).toBe(
        'code: It has no default value.',
      )
    })

    it('should count a NULL past the end of a short row as no change', () => {
      const context: EditContext = { ...CONTEXT, original: () => [1] }

      expect(
        act(NO_EDITS, { kind: EditKind.SetNull, cells: [cell(row(0), 2)] }, context).edits,
      ).toEqual(NO_EDITS)
    })

    it('should refuse a new row that is gone while others are there', () => {
      const added = edited(NO_EDITS, { kind: EditKind.Insert })

      expect(
        act(added, { kind: EditKind.Set, cells: [cell({ isNew: true, id: 2 }, 2)], input: 'x' }),
      ).toStrictEqual({ edits: added, problem: 'This row is no longer in the result.' })
    })

    it('should set the cells of a new row, whatever the row of the result holds', () => {
      const added = edited(NO_EDITS, { kind: EditKind.Insert })
      const sut = edited(added, {
        kind: EditKind.Set,
        cells: [cell({ isNew: true, id: 1 }, 2)],
        input: 'gift',
      })

      expect(sut.newRows).toStrictEqual([
        { id: 1, cells: new Map([[2, { kind: PendingKind.Text, text: 'gift' }]]) },
      ])
    })
  })

  describe('reverting', () => {
    it('should revert cells, and bring deleted rows back', () => {
      const changed = edited(NO_EDITS, {
        kind: EditKind.Set,
        cells: [cell(row(0), 2), cell(row(1), 2)],
        input: 'x',
      })
      const deleted = edited(changed, { kind: EditKind.Delete, cells: [cell(row(1), 0)] })

      const sut = edited(deleted, {
        kind: EditKind.Revert,
        cells: [cell(row(0), 2), cell(row(1), 2)],
      })

      expect([...sut.rows.keys()]).toStrictEqual([1])
      expect(sut.rows.get(1)?.isDeleted).toBe(false)
    })

    it('should revert everything', () => {
      const changed = edited(NO_EDITS, { kind: EditKind.Set, cells: [cell(row(0), 2)], input: 'x' })

      expect(edited(changed, { kind: EditKind.RevertAll }).rows.size).toBe(0)
    })
  })

  describe('rows', () => {
    it('should add a row with every value left to its default', () => {
      expect(edited(NO_EDITS, { kind: EditKind.Insert }).newRows).toStrictEqual([
        { id: 1, cells: new Map() },
      ])
    })

    it('should not add rows a column that needs a value keeps out', () => {
      const context: EditContext = {
        ...CONTEXT,
        table: { ...CONTEXT.table, insertProblem: 'Adding rows needs a value for code.' },
      }

      expect(act(NO_EDITS, { kind: EditKind.Insert }, context).problem).toBe(
        'Adding rows needs a value for code.',
      )
      expect(
        act(NO_EDITS, { kind: EditKind.Duplicate, cells: [cell(row(0), 0)] }, context).problem,
      ).toBe('Adding rows needs a value for code.')
    })

    it('should duplicate what the grid shows of a row, leaving out what the server computes', () => {
      const changed = edited(NO_EDITS, {
        kind: EditKind.Set,
        cells: [cell(row(1), 1)],
        input: 'B-2',
      })

      const sut = edited(changed, {
        kind: EditKind.Duplicate,
        cells: [cell(row(0), 0), cell(row(1), 3), cell(row(1), 4)],
      })

      expect(sut.newRows.map(({ cells }) => [...cells])).toStrictEqual([
        [
          [0, { kind: PendingKind.Text, text: '1' }],
          [1, { kind: PendingKind.Text, text: 'A-1' }],
          [2, { kind: PendingKind.Null }],
          [3, { kind: PendingKind.Text, text: '12.50' }],
          [4, { kind: PendingKind.Text, text: '{"a": 1}' }],
          [5, { kind: PendingKind.Text, text: '2026-01-02 03:04:05+00' }],
        ],
        [
          [0, { kind: PendingKind.Text, text: '2' }],
          [1, { kind: PendingKind.Text, text: 'B-2' }],
          [2, { kind: PendingKind.Text, text: 'gift' }],
          [3, { kind: PendingKind.Null }],
          [4, { kind: PendingKind.Null }],
          [5, { kind: PendingKind.Text, text: '2026-01-03 03:04:05+00' }],
        ],
      ])
    })

    it('should leave a key the server generates to the server', () => {
      const description = {
        ...ORDERS,
        columns: ORDERS.columns.map((column) =>
          column.name === 'id' ? tableColumn('id', { hasDefault: true }) : column,
        ),
      }
      const context: EditContext = { ...CONTEXT, table: tableOf(description) }

      const sut = act(NO_EDITS, { kind: EditKind.Duplicate, cells: [cell(row(0), 0)] }, context)

      expect(sut.edits.newRows[0]?.cells.has(0)).toBe(false)
      expect(sut.edits.newRows[0]?.cells.has(1)).toBe(true)
    })

    it('should duplicate a new row, and refuse a row that is gone', () => {
      const added = edited(NO_EDITS, { kind: EditKind.Insert })
      const filled = edited(added, {
        kind: EditKind.Set,
        cells: [cell({ isNew: true, id: 1 }, 2)],
        input: 'x',
      })

      const sut = edited(filled, {
        kind: EditKind.Duplicate,
        cells: [cell({ isNew: true, id: 1 }, 0)],
      })

      expect(sut.newRows.map(({ id, cells }) => [id, [...cells]])).toStrictEqual([
        [1, [[2, { kind: PendingKind.Text, text: 'x' }]]],
        [2, [[2, { kind: PendingKind.Text, text: 'x' }]]],
      ])
      expect(
        act(filled, { kind: EditKind.Duplicate, cells: [cell({ isNew: true, id: 7 }, 0)] }).problem,
      ).toBe('This row is no longer in the result.')
      expect(act(filled, { kind: EditKind.Duplicate, cells: [cell(row(9), 0)] }).problem).toBe(
        'This row is no longer in the result.',
      )
    })

    it('should mark rows of the result for deletion and drop new rows', () => {
      const added = edited(NO_EDITS, { kind: EditKind.Insert })

      const sut = edited(added, {
        kind: EditKind.Delete,
        cells: [cell(row(0), 0), cell(row(0), 3), cell({ isNew: true, id: 1 }, 0)],
      })

      expect(sut.newRows).toStrictEqual([])
      expect([...sut.rows]).toStrictEqual([[0, { cells: new Map(), isDeleted: true }]])
    })

    it('should delete nothing when a row is gone', () => {
      expect(
        act(NO_EDITS, { kind: EditKind.Delete, cells: [cell(row(0), 0), cell(row(5), 0)] }),
      ).toStrictEqual({
        edits: NO_EDITS,
        problem: 'This row is no longer in the result.',
      })
      expect(
        act(NO_EDITS, { kind: EditKind.Delete, cells: [cell({ isNew: true, id: 3 }, 0)] }).problem,
      ).toBe('This row is no longer in the result.')
    })
  })

  it(`should keep at most ${String(MAX_CHANGED_ROWS)} changed rows`, () => {
    const context: EditContext = { ...CONTEXT, original: () => ROWS[0] }
    const cells = Array.from({ length: MAX_CHANGED_ROWS }, (...[, index]) => cell(row(index), 0))
    const full = act(NO_EDITS, { kind: EditKind.Delete, cells }, context)

    expect(full.problem).toBe('')
    expect(act(full.edits, { kind: EditKind.Insert }, context)).toStrictEqual({
      edits: full.edits,
      problem: 'sqldoro applies at most 1,000 changed rows at a time: apply or revert these first.',
    })
    expect(
      act(full.edits, { kind: EditKind.Revert, cells: [cell(row(0), 0)] }, context).problem,
    ).toBe('')
  })

  it('should read a boolean the way the column does', () => {
    const description = {
      ...ORDERS,
      columns: ORDERS.columns.map((column) =>
        column.name === 'note'
          ? { ...column, value: { type: ValueType.Boolean } as const }
          : column,
      ),
    }
    const table = tableOf(description)
    const sut = act(
      NO_EDITS,
      { kind: EditKind.Set, cells: [cell(row(1), 2)], input: 'TRUE' },
      { ...CONTEXT, table },
    )

    expect(sut.edits.rows.get(1)?.cells.get(2)).toStrictEqual({
      kind: PendingKind.Text,
      text: 'true',
    })
  })
})
