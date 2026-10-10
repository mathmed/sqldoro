import { describe, expect, it } from 'vitest'

import type { RowSource } from './edit-targets.ts'
import { pendingView, previewOf, shownValue } from './edit-wire.ts'
import { addRow, deleteRow, NO_EDITS, PendingKind, setCell } from './pending.ts'
import { EditVerb } from './statements.ts'

// Rows 0 to 3 of the result, shown in reverse; row 1 hidden by a filter.
const ROWS: RowSource = {
  rowCount: 3,
  sourceIndex: () => undefined,
  viewPositions: (indexes) =>
    new Map(indexes.flatMap((index) => (index === 1 ? [] : [[index, 3 - index] as const]))),
  sourceRow: () => undefined,
}
const TEXT = { kind: PendingKind.Text, text: 'x' } as const

describe('pendingView', () => {
  it('should list changed rows by their place in the view, count the hidden ones and say their problems', () => {
    const changed = setCell(NO_EDITS, {
      row: { isNew: false, index: 3 },
      column: 4,
      value: TEXT,
      original: null,
    })
    const both = setCell(changed, {
      row: { isNew: false, index: 3 },
      column: 1,
      value: { kind: PendingKind.Null },
      original: 'a',
    })
    const edits = addRow(
      deleteRow(deleteRow(both, { isNew: false, index: 1 }), { isNew: false, index: 0 }),
      new Map([[2, TEXT]]),
    )

    const sut = pendingView(edits, ROWS, (row) =>
      row.isNew ? 'new row problem' : `row ${String(row.index)}`,
    )

    expect(sut).toStrictEqual({
      rows: [
        {
          row: 0,
          isDeleted: false,
          cells: [
            { column: 1, value: { kind: PendingKind.Null } },
            { column: 4, value: TEXT },
          ],
          problem: 'row 3',
        },
        { row: 3, isDeleted: true, cells: [], problem: 'row 0' },
      ],
      newRows: [{ id: 1, cells: [{ column: 2, value: TEXT }], problem: 'new row problem' }],
      hiddenRows: 1,
    })
  })
})

describe('pendingView, in the order of the view', () => {
  it('should list rows by their place in the view, whatever order they changed in', () => {
    const first = setCell(NO_EDITS, {
      row: { isNew: false, index: 0 },
      column: 0,
      value: TEXT,
      original: null,
    })
    const edits = setCell(first, {
      row: { isNew: false, index: 3 },
      column: 0,
      value: TEXT,
      original: null,
    })

    expect(pendingView(edits, ROWS, () => '').rows.map(({ row }) => row)).toStrictEqual([0, 3])
  })

  it('should not look for rows of the result when none changed', () => {
    let lookups = 0
    const counting: RowSource = {
      ...ROWS,
      viewPositions: (indexes) => {
        lookups += 1
        return ROWS.viewPositions(indexes)
      },
    }

    expect(pendingView(addRow(NO_EDITS, new Map()), counting, () => '').hiddenRows).toBe(0)
    expect(lookups).toBe(0)
  })
})

describe('previewOf', () => {
  it('should show each statement with its values as people read them', () => {
    const statement = {
      verb: EditVerb.Update,
      sql: 'UPDATE t SET a = $1 WHERE id = $2',
      values: ["it's", '7'],
      expectedRows: 1,
      row: { isNew: false, index: 0 },
      label: 'id = 7',
    } as const
    const plan = { statements: [statement], deletions: 0, summary: '1 update on t' }

    expect(previewOf({ id: 3, plan, isInOpenTransaction: true })).toStrictEqual({
      id: 3,
      summary: '1 update on t',
      statements: [
        {
          sql: 'UPDATE t SET a = $1 WHERE id = $2',
          values: ["'it''s'", "'7'"],
          expectedRows: 1,
          label: 'id = 7',
        },
      ],
      deletions: 0,
      isInOpenTransaction: true,
    })
  })
})

describe('shownValue', () => {
  it('should quote text, doubling its quotes', () => {
    expect(shownValue('')).toBe("''")
    expect(shownValue("a'b")).toBe("'a''b'")
  })

  it('should cut long text, saying how long it is', () => {
    expect(shownValue('x'.repeat(200))).toBe(`'${'x'.repeat(200)}'`)
    expect(shownValue('x'.repeat(1500))).toBe(`'${'x'.repeat(200)}…' (1,500 characters)`)
  })
})
