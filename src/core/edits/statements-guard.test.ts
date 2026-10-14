// The statements the grid's changes become go through the same guard as hand-typed SQL: these tests
// prove the guard reads them as the writes they are, never as writes of every row, and that it would
// hold one that reached every row if the generator ever wrote it.
import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import {
  MYSQL_ORDERS,
  MYSQL_ROW,
  POSTGRES_ORDERS,
  POSTGRES_ROW,
} from '../../../test/fixtures/edit-tables.ts'
import { classifyStatement } from '../safety/classify.ts'
import { assessRun, Verdict } from '../safety/guard.ts'
import { StatementCategory } from '../safety/statement-class.ts'
import type { EditableTable } from './editability.ts'
import { PendingKind } from './pending.ts'
import {
  deleteStatement,
  type EditStatement,
  insertStatement,
  type StatementTarget,
  updateStatement,
} from './statements.ts'

const POLICY = { productionEnvironments: new Set(['prod']) }
const WRITABLE = { name: 'Shop', environment: 'dev', isReadOnly: false }
const TARGETS: readonly (readonly [string, StatementTarget, readonly unknown[]])[] = [
  ['PostgreSQL', { dialect: POSTGRES_DIALECT, table: POSTGRES_ORDERS }, POSTGRES_ROW],
  ['MySQL', { dialect: MYSQL_DIALECT, table: MYSQL_ORDERS }, MYSQL_ROW],
]

function statementsOf(target: StatementTarget, row: readonly unknown[]): EditStatement[] {
  const original = row as Parameters<typeof deleteStatement>[1]['original']
  const text = { kind: PendingKind.Text, text: "it's; DELETE FROM orders" } as const
  const keyOnly: EditableTable = { ...target.table, columns: target.table.columns.slice(0, 1) }
  return [
    updateStatement(target, { index: 0, original, cells: new Map([[2, text]]) }),
    updateStatement(target, { index: 0, original, cells: new Map([[0, text]]) }),
    updateStatement(target, {
      index: 0,
      original,
      cells: new Map([
        [3, { kind: PendingKind.Null }],
        [5, { kind: PendingKind.Default }],
      ]),
    }),
    deleteStatement(target, { index: 0, original }),
    deleteStatement({ ...target, table: keyOnly }, { index: 0, original }),
    insertStatement(target, { id: 1, position: 1, cells: new Map([[1, text]]) }),
    insertStatement(target, { id: 1, position: 1, cells: new Map() }),
  ]
}

// The statement as it would read had the generator left its WHERE out.
function withoutWhere(sql: string): string {
  return sql.slice(0, sql.indexOf(' WHERE '))
}

describe.each(TARGETS)('the guard, on the statements of edits (%s)', (...[, target, row]) => {
  const statements = statementsOf(target, row)
  const dialect = target.dialect === MYSQL_DIALECT ? MYSQL_DIALECT : POSTGRES_DIALECT

  it('should read each one as a write that does not reach every row', () => {
    for (const statement of statements) {
      expect(classifyStatement(statement.sql, dialect)).toMatchObject({
        category: StatementCategory.Write,
        verb: statement.verb,
        unfiltered: [],
      })
    }
  })

  it('should let them run on a writable connection without asking anything', () => {
    const classes = statements.map((statement) => classifyStatement(statement.sql, dialect))

    expect(assessRun(classes, WRITABLE, POLICY)).toStrictEqual({ verdict: Verdict.Allow })
  })

  it('should block them on a read-only connection', () => {
    const classes = statements.map((statement) => classifyStatement(statement.sql, dialect))

    expect(assessRun(classes, { ...WRITABLE, isReadOnly: true }, POLICY)).toMatchObject({
      verdict: Verdict.Block,
    })
  })

  it('should ask for the button of a production connection, once for the whole batch', () => {
    const classes = statements.map((statement) => classifyStatement(statement.sql, dialect))
    const decision = assessRun(classes, { ...WRITABLE, environment: 'prod' }, POLICY)

    expect(decision).toMatchObject({ verdict: Verdict.Confirm })
    expect(decision.verdict === Verdict.Confirm && decision.confirmations).toStrictEqual([
      expect.objectContaining({ kind: 'production', style: 'button', button: 'Run on Shop' }),
    ])
  })

  it('should hold an UPDATE or a DELETE of every row, had the generator written one', () => {
    const filtered = statements.filter((statement) => statement.sql.includes(' WHERE '))
    const unfiltered = filtered.map((statement) =>
      classifyStatement(withoutWhere(statement.sql), dialect),
    )

    expect(filtered).toHaveLength(5)
    for (const statement of unfiltered) {
      expect(statement.unfiltered).toStrictEqual([
        { verb: statement.verb, table: 'orders', hasAlwaysTrueWhere: false },
      ])
    }
    expect(assessRun(unfiltered, WRITABLE, POLICY)).toMatchObject({ verdict: Verdict.Confirm })
  })
})
