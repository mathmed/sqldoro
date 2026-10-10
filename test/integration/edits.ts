// The edits of the grid against real servers, without the extension host: whether the core finds
// the rows of a query editable, the changes the grid makes to them, and how each statement of their
// plan goes when it runs on a session.
import { applyEdit, type EditAction } from '../../src/core/edits/edit-actions.ts'
import { EditKind } from '../../src/core/edits/edit-kind.ts'
import type { Editability, EditableTable } from '../../src/core/edits/editability.ts'
import {
  outcomeOfError,
  outcomeOfRows,
  type StatementOutcome,
} from '../../src/core/edits/outcome.ts'
import { NO_EDITS, type PendingEdits } from '../../src/core/edits/pending.ts'
import { type EditPlan, planEdits } from '../../src/core/edits/plan.ts'
import { resultEditability } from '../../src/core/edits/result-editability.ts'
import type { Engine, EngineSession } from '../../src/core/engine/engine.ts'
import type { QueryResult, QueryValue, Row } from '../../src/core/engine/query.ts'
import { describeError } from '../../src/core/text/errors.ts'

export interface Server {
  readonly engine: Engine
  readonly session: EngineSession
  readonly database: string
}

export interface EditableRows {
  readonly table: EditableTable
  readonly rows: readonly Row[]
}

const MAX_ROWS = 1000

export async function query(
  session: EngineSession,
  sql: string,
  values: readonly QueryValue[] = [],
): Promise<QueryResult> {
  return session.execute({
    sql,
    values,
    maxRows: MAX_ROWS,
    onColumns: () => undefined,
    onRows: () => undefined,
  }).result
}

// The first row a query returns, for the checks of what a table holds.
export async function firstRow(
  session: EngineSession,
  sql: string,
  values: readonly QueryValue[] = [],
): Promise<Row | undefined> {
  const result = await query(session, sql, values)
  return result.rows.at(0)
}

// The rows of a query, and what the extension finds before the grid edits them.
async function readRows(
  server: Server,
  sql: string,
): Promise<{ readonly rows: readonly Row[]; readonly editability: Editability }> {
  const result = await query(server.session, sql)
  const editability = await resultEditability(server.session, {
    sql,
    columns: result.columns,
    dialect: server.engine.dialect,
    database: server.database,
  })
  return { rows: result.rows, editability }
}

export async function editabilityOf(server: Server, sql: string): Promise<Editability> {
  const { editability } = await readRows(server, sql)
  return editability
}

// The rows of a query the grid can edit, and how; fails when it cannot.
export async function editableRows(server: Server, sql: string): Promise<EditableRows> {
  const { rows, editability } = await readRows(server, sql)
  if ('problem' in editability) {
    throw new Error(editability.problem)
  }
  return { table: editability.table, rows }
}

// A value typed in a cell of a row of the result.
export function typed(index: number, column: number, input: string): EditAction {
  return { kind: EditKind.Set, cells: [{ row: { isNew: false, index }, column }], input }
}

// A value typed in a cell of a row added in the grid.
export function typedInNew(id: number, column: number, input: string): EditAction {
  return { kind: EditKind.Set, cells: [{ row: { isNew: true, id }, column }], input }
}

// NULL, DEFAULT, a duplicate or a deletion, on a cell (or the row) of the result.
export function onCell(kind: EditKind, index: number, column = 0): EditAction {
  return { kind, cells: [{ row: { isNew: false, index }, column }], input: '' }
}

export const NEW_ROW: EditAction = { kind: EditKind.Insert, cells: [], input: '' }

// The changes the grid holds after these edits; fails on one it refuses.
export function edited(rows: EditableRows, actions: readonly EditAction[]): PendingEdits {
  let edits = NO_EDITS
  for (const action of actions) {
    const outcome = applyEdit(edits, action, {
      table: rows.table,
      original: (index) => rows.rows.at(index),
    })
    if (outcome.problem !== '') {
      throw new Error(outcome.problem)
    }
    edits = outcome.edits
  }
  return edits
}

export function planned(rows: EditableRows, edits: PendingEdits, server: Server): EditPlan {
  const reading = planEdits(edits, {
    table: rows.table,
    dialect: server.engine.dialect,
    original: (index) => rows.rows.at(index),
  })
  if ('problem' in reading) {
    throw new Error(reading.problem)
  }
  return reading.plan
}

// Runs the statements of a plan one after the other on a session, as an apply does, and says how
// each went.
export async function runPlan(session: EngineSession, plan: EditPlan): Promise<StatementOutcome[]> {
  const outcomes: StatementOutcome[] = []
  for (const statement of plan.statements) {
    const outcome = await query(session, statement.sql, statement.values).then(
      (result) => outcomeOfRows(statement, result.affectedRows),
      (error: unknown) => outcomeOfError(statement, describeError(error)),
    )
    outcomes.push(outcome)
  }
  return outcomes
}

// The plan of these edits of the rows of a query, run on the session of the server.
export async function applied(
  server: Server,
  sql: string,
  actions: readonly EditAction[],
): Promise<{ readonly plan: EditPlan; readonly outcomes: StatementOutcome[] }> {
  const rows = await editableRows(server, sql)
  const plan = planned(rows, edited(rows, actions), server)
  return { plan, outcomes: await runPlan(server.session, plan) }
}
