import { describe, expect, it } from 'vitest'

import {
  applyReport,
  isStopping,
  OutcomeKind,
  outcomeOfError,
  outcomeOfRows,
  type StatementRecord,
} from './outcome.ts'
import type { EditPlan } from './plan.ts'
import { type EditStatement, EditVerb } from './statements.ts'

function statement(verb: EditVerb, label = 'id = 7'): EditStatement {
  return {
    verb,
    sql: `${verb} …`,
    values: [],
    expectedRows: 1,
    row: { isNew: false, index: 3 },
    label,
  }
}

const UPDATE = statement(EditVerb.Update)
const DELETE = statement(EditVerb.Delete, 'id = 8')
const INSERT = { ...statement(EditVerb.Insert, 'new row 1'), row: { isNew: true, id: 1 } } as const
const PLAN: EditPlan = {
  table: 'sales.orders',
  statements: [UPDATE, DELETE, INSERT],
  deletions: 1,
  summary: '1 update, 1 insertion and 1 deletion on sales.orders',
}
const DONE = { kind: OutcomeKind.Done, problem: '' }

describe('outcomeOfRows', () => {
  it('should count a statement that changed the rows it had to as done', () => {
    expect(outcomeOfRows(UPDATE, 1)).toStrictEqual(DONE)
  })

  it('should see a conflict in an UPDATE or a DELETE that changed no row', () => {
    expect(outcomeOfRows(UPDATE, 0)).toStrictEqual({
      kind: OutcomeKind.Conflict,
      problem: 'id = 7 changed or was deleted since sqldoro read it: it was not overwritten.',
    })
    expect(outcomeOfRows(DELETE, 0)).toStrictEqual({
      kind: OutcomeKind.Conflict,
      problem: 'id = 8 changed or was already deleted since sqldoro read it: it was not deleted.',
    })
  })

  it('should fail a statement that changed another number of rows, or did not say', () => {
    expect(outcomeOfRows(UPDATE, 2)).toStrictEqual({
      kind: OutcomeKind.Failed,
      problem: 'id = 7 would have changed 2 rows instead of 1.',
    })
    expect(outcomeOfRows(INSERT, 0)).toStrictEqual({
      kind: OutcomeKind.Failed,
      problem: 'new row 1 would have changed 0 rows instead of 1.',
    })
    expect(outcomeOfRows({ ...UPDATE, expectedRows: 2 }, 1)).toStrictEqual({
      kind: OutcomeKind.Failed,
      problem: 'id = 7 would have changed 1 row instead of 2.',
    })
    expect(outcomeOfRows(DELETE, undefined)).toStrictEqual({
      kind: OutcomeKind.Failed,
      problem: 'id = 8: the server did not say how many rows it changed.',
    })
  })
})

describe('outcomeOfError', () => {
  it('should fail the statement with the message of the server', () => {
    expect(outcomeOfError(INSERT, 'duplicate key value violates unique constraint')).toEqual({
      kind: OutcomeKind.Failed,
      problem: 'new row 1: duplicate key value violates unique constraint',
    })
  })
})

describe('isStopping', () => {
  it('should stop at a failure, not at a conflict', () => {
    expect(isStopping(outcomeOfRows(UPDATE, 2))).toBe(true)
    expect(isStopping(outcomeOfRows(UPDATE, 0))).toBe(false)
    expect(isStopping(DONE)).toBe(false)
  })
})

describe('applyReport', () => {
  const allDone: StatementRecord[] = PLAN.statements.map((done) => ({
    statement: done,
    outcome: DONE,
  }))

  it('should say everything applied', () => {
    expect(applyReport(allDone, { plan: PLAN, isInOpenTransaction: false })).toStrictEqual({
      isApplied: true,
      message: 'Applied 1 update, 1 insertion and 1 deletion on sales.orders.',
      problems: [],
    })
  })

  it('should say the changes wait in the open transaction', () => {
    expect(applyReport(allDone, { plan: PLAN, isInOpenTransaction: true }).message).toBe(
      'Applied 1 update, 1 insertion and 1 deletion on sales.orders. The changes are in the open transaction of this editor: commit it to keep them.',
    )
  })

  it('should say nothing applied, and why for each row', () => {
    const records: StatementRecord[] = [
      { statement: UPDATE, outcome: outcomeOfRows(UPDATE, 0) },
      { statement: DELETE, outcome: DONE },
      { statement: INSERT, outcome: outcomeOfError(INSERT, 'duplicate key') },
    ]

    expect(applyReport(records, { plan: PLAN, isInOpenTransaction: true })).toStrictEqual({
      isApplied: false,
      message:
        'Nothing was applied: id = 7 changed or was deleted since sqldoro read it: it was not overwritten. (1 more row did not apply either.)',
      problems: [
        {
          row: { isNew: false, index: 3 },
          problem: 'id = 7 changed or was deleted since sqldoro read it: it was not overwritten.',
        },
        { row: { isNew: true, id: 1 }, problem: 'new row 1: duplicate key' },
      ],
    })
  })

  it('should count the other rows that did not apply', () => {
    const records: StatementRecord[] = PLAN.statements.map((refused) => ({
      statement: refused,
      outcome: outcomeOfRows(refused, 0),
    }))

    expect(applyReport(records, { plan: PLAN, isInOpenTransaction: false }).message).toMatch(
      /\(2 more rows did not apply either\.\)$/,
    )
    expect(
      applyReport(records.slice(0, 1), { plan: PLAN, isInOpenTransaction: false }).message,
    ).toBe(
      'Nothing was applied: id = 7 changed or was deleted since sqldoro read it: it was not overwritten.',
    )
  })

  it('should not count an apply that stopped before its end as applied', () => {
    expect(
      applyReport(allDone.slice(0, 2), { plan: PLAN, isInOpenTransaction: false }),
    ).toStrictEqual({
      isApplied: false,
      message: 'Nothing was applied: the apply stopped before its end.',
      problems: [],
    })
  })
})
