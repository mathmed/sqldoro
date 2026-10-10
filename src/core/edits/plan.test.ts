import { describe, expect, it } from 'vitest'

import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { POSTGRES_ORDERS, POSTGRES_ROW } from '../../../test/fixtures/edit-tables.ts'
import type { Row } from '../engine/query.ts'
import type { EditableTable } from './editability.ts'
import {
  addRow,
  deleteRow,
  NO_EDITS,
  type PendingEdits,
  PendingKind,
  type PendingValue,
  setCell,
} from './pending.ts'
import { type PlanContext, planEdits } from './plan.ts'

const ROWS: readonly Row[] = [
  POSTGRES_ROW,
  [2, ...POSTGRES_ROW.slice(1)],
  [3, ...POSTGRES_ROW.slice(1)],
]
const CONTEXT: PlanContext = {
  table: POSTGRES_ORDERS,
  dialect: POSTGRES_DIALECT,
  original: (index) => ROWS.at(index),
}

function text(value: string): PendingValue {
  return { kind: PendingKind.Text, text: value }
}

function changed(edits: PendingEdits, index: number, column = 2): PendingEdits {
  return setCell(edits, { row: { isNew: false, index }, column, value: text('x'), original: null })
}

function complete(): ReadonlyMap<number, PendingValue> {
  return new Map([
    [0, text('9')],
    [1, text('Z-9')],
  ])
}

function planned(edits: PendingEdits, context = CONTEXT): ReturnType<typeof planEdits> {
  return planEdits(edits, context)
}

describe('planEdits', () => {
  it('should have nothing to apply without changes', () => {
    expect(planned(NO_EDITS)).toStrictEqual({ problem: 'There are no changes to apply.' })
  })

  it('should delete, then update, then insert, rows of the result in their order', () => {
    const edits = addRow(
      deleteRow(changed(changed(NO_EDITS, 2), 0), { isNew: false, index: 1 }),
      complete(),
    )

    const reading = planned(edits)

    expect(
      'plan' in reading && reading.plan.statements.map(({ verb, label }) => [verb, label]),
    ).toEqual([
      ['DELETE', 'id = 2'],
      ['UPDATE', 'id = 1'],
      ['UPDATE', 'id = 3'],
      ['INSERT', 'new row 1'],
    ])
    expect(reading).toMatchObject({
      plan: { deletions: 1, summary: '2 updates, 1 insertion and 1 deletion on sales.orders' },
    })
  })

  it.each([
    [changed(NO_EDITS, 0), '1 update on sales.orders'],
    [addRow(changed(NO_EDITS, 0), complete()), '1 update and 1 insertion on sales.orders'],
    [addRow(addRow(NO_EDITS, complete()), complete()), '2 insertions on sales.orders'],
    [
      deleteRow(deleteRow(NO_EDITS, { isNew: false, index: 0 }), { isNew: false, index: 2 }),
      '2 deletions on sales.orders',
    ],
  ])('should sum the plan up: %#', (edits, summary) => {
    expect(planned(edits)).toMatchObject({ plan: { summary } })
  })

  it('should not plan a row that is no longer in the result', () => {
    expect(planned(changed(NO_EDITS, 7))).toStrictEqual({
      problem: 'A changed row is no longer in the result: revert its changes.',
    })
  })

  it('should say which new row needs which values', () => {
    const edits = addRow(
      addRow(NO_EDITS, complete()),
      new Map([[1, { kind: PendingKind.Default }]]),
    )

    expect(planned(edits)).toStrictEqual({ problem: 'New row 2 needs a value for id, code.' })
    expect(
      planned(
        addRow(
          NO_EDITS,
          new Map([
            [0, { kind: PendingKind.Null }],
            [1, text('x')],
          ]),
        ),
      ),
    ).toEqual({
      problem: 'New row 1 needs a value for id.',
    })
  })

  it('should not ask a value of a column the server fills or the grid cannot set', () => {
    const table: EditableTable = {
      ...POSTGRES_ORDERS,
      columns: POSTGRES_ORDERS.columns.map((column, index) =>
        index === 0 ? { ...column, hasDefault: true } : column,
      ),
    }
    const readOnlyCode: EditableTable = {
      ...POSTGRES_ORDERS,
      columns: POSTGRES_ORDERS.columns.map((column, index) =>
        index === 1 ? { ...column, value: { type: 'readOnly', reason: 'x' } } : column,
      ),
    }

    expect(
      planned(addRow(NO_EDITS, new Map([[1, text('x')]])), { ...CONTEXT, table }),
    ).toHaveProperty('plan')
    expect(
      planned(addRow(NO_EDITS, new Map([[0, text('1')]])), { ...CONTEXT, table: readOnlyCode }),
    ).toHaveProperty('plan')
  })
})
