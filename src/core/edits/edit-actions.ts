import type { CellValue, Row } from '../engine/query.ts'
import { ValueType } from '../engine/table.ts'
import { groupDigits } from '../results/tabs.ts'
import { EditKind } from './edit-kind.ts'
import type { EditableColumn, EditableTable } from './editability.ts'
import {
  addRow,
  type CellChange,
  changedRowCount,
  deleteRow,
  type PendingEdits,
  PendingKind,
  type PendingValue,
  revertAll,
  revertCell,
  type RowTarget,
  setCell,
} from './pending.ts'
import { readValue } from './values.ts'

export interface CellTarget {
  readonly row: RowTarget
  readonly column: number
}

export interface EditAction {
  readonly kind: EditKind
  // The cells it changes; duplicating and deleting act on their rows.
  readonly cells: readonly CellTarget[]
  // What was typed, for Set.
  readonly input: string
}

export interface EditContext {
  readonly table: EditableTable
  // The row of the result at a position, as the query returned it.
  readonly original: (index: number) => Row | undefined
}

export interface EditOutcome {
  readonly edits: PendingEdits
  // Why nothing changed, for people; empty when the edit applies.
  readonly problem: string
}

type Reading<T> =
  | { readonly isValid: true; readonly value: T }
  | { readonly isValid: false; readonly problem: string }

type Handler = (edits: PendingEdits, action: EditAction, context: EditContext) => EditOutcome
type ValueOf = (column: EditableColumn) => Reading<PendingValue>

// Applying more rows at once is the work of a script, not of a grid.
export const MAX_CHANGED_ROWS = 1000
const NO_ROW = 'This row is no longer in the result.'
const NO_COLUMN = 'This column is not in the result.'
const DELETED = 'This row is marked for deletion: revert the deletion to change it.'
const TOO_MANY = `sqldoro applies at most ${groupDigits(MAX_CHANGED_ROWS)} changed rows at a time: apply or revert these first.`

const HANDLERS: Readonly<Record<EditKind, Handler>> = {
  [EditKind.Set]: (edits, action, context) =>
    setEach(edits, action, {
      context,
      valueOf: (column) => typed(readValue(action.input, column.value)),
    }),
  [EditKind.SetNull]: (edits, action, context) =>
    setEach(edits, action, {
      context,
      valueOf: (column) =>
        column.isNullable ? accepted({ kind: PendingKind.Null }) : refused('It cannot be NULL.'),
    }),
  [EditKind.SetDefault]: (edits, action, context) =>
    setEach(edits, action, {
      context,
      valueOf: (column) =>
        column.hasDefault
          ? accepted({ kind: PendingKind.Default })
          : refused('It has no default value.'),
    }),
  [EditKind.Revert]: (edits, action) => ({
    edits: action.cells.reduce((next, cell) => revertCell(next, cell.row, cell.column), edits),
    problem: '',
  }),
  [EditKind.RevertAll]: (edits) => ({ edits: revertAll(edits), problem: '' }),
  [EditKind.Insert]: (edits, ...[, context]) => addRows(edits, context, accepted([new Map()])),
  [EditKind.Duplicate]: (edits, action, context) =>
    addRows(edits, context, allOf(rowsOf(action).map((row) => copyOf(edits, row, context)))),
  [EditKind.Delete]: remove,
}

export function applyEdit(
  edits: PendingEdits,
  action: EditAction,
  context: EditContext,
): EditOutcome {
  const outcome = HANDLERS[action.kind](edits, action, context)
  return changedRowCount(outcome.edits) > MAX_CHANGED_ROWS ? { edits, problem: TOO_MANY } : outcome
}

function accepted<T>(value: T): Reading<T> {
  return { isValid: true, value }
}

function refused<T>(problem: string): Reading<T> {
  return { isValid: false, problem }
}

function typed(reading: Reading<string>): Reading<PendingValue> {
  return reading.isValid ? accepted({ kind: PendingKind.Text, text: reading.value }) : reading
}

// Every reading is valid, or the first problem.
function allOf<T>(readings: readonly Reading<T>[]): Reading<T[]> {
  const values: T[] = []
  for (const reading of readings) {
    if (!reading.isValid) {
      return reading
    }
    values.push(reading.value)
  }
  return accepted(values)
}

function outcomeOf(edits: PendingEdits, next: Reading<PendingEdits>): EditOutcome {
  return next.isValid ? { edits: next.value, problem: '' } : { edits, problem: next.problem }
}

interface CellReader {
  readonly context: EditContext
  readonly valueOf: ValueOf
}

// Every cell takes the value, or none does.
function setEach(edits: PendingEdits, action: EditAction, reader: CellReader): EditOutcome {
  const changes = allOf(action.cells.map((cell) => readCell(edits, cell, reader)))
  return outcomeOf(
    edits,
    changes.isValid ? accepted(changes.value.reduce(setCell, edits)) : changes,
  )
}

function readCell(
  edits: PendingEdits,
  cell: CellTarget,
  { context, valueOf }: CellReader,
): Reading<CellChange> {
  const rowProblem = rowProblemOf(edits, cell.row, context)
  const column = columnOf(context, cell.column)
  if (rowProblem !== undefined) {
    return refused(rowProblem)
  }
  if (!column.isValid) {
    return column
  }
  const value = valueOf(column.value)
  return value.isValid
    ? accepted({ ...cell, value: value.value, original: originalOf(cell, context) })
    : refused(`${column.value.name}: ${value.problem}`)
}

// A row takes values when it is still there and not marked for deletion.
function rowProblemOf(
  edits: PendingEdits,
  row: RowTarget,
  context: EditContext,
): string | undefined {
  return row.isNew
    ? newRowProblem(edits, row.id)
    : (missingRow(context, row.index) ?? deletedRow(edits, row.index))
}

function newRowProblem(edits: PendingEdits, id: number): string | undefined {
  return edits.newRows.some((row) => row.id === id) ? undefined : NO_ROW
}

function missingRow(context: EditContext, index: number): string | undefined {
  return context.original(index) === undefined ? NO_ROW : undefined
}

function deletedRow(edits: PendingEdits, index: number): string | undefined {
  return edits.rows.get(index)?.isDeleted === true ? DELETED : undefined
}

// The column of a cell, when it takes values.
function columnOf(context: EditContext, index: number): Reading<EditableColumn> {
  const column = context.table.columns.at(index)
  if (column === undefined) {
    return refused(NO_COLUMN)
  }
  return column.value.type === ValueType.ReadOnly
    ? refused(`${column.name}: ${column.value.reason}`)
    : accepted(column)
}

// A row shorter than its columns holds NULL past its end.
function originalOf(cell: CellTarget, context: EditContext): CellValue {
  return cell.row.isNew ? null : (context.original(cell.row.index)?.at(cell.column) ?? null)
}

function addRows(
  edits: PendingEdits,
  context: EditContext,
  rows: Reading<readonly ReadonlyMap<number, PendingValue>[]>,
): EditOutcome {
  if (context.table.insertProblem !== '') {
    return { edits, problem: context.table.insertProblem }
  }
  return outcomeOf(edits, rows.isValid ? accepted(rows.value.reduce(addRow, edits)) : rows)
}

function remove(edits: PendingEdits, action: EditAction, context: EditContext): EditOutcome {
  const rows = allOf(rowsOf(action).map((row) => existing(edits, row, context)))
  return outcomeOf(edits, rows.isValid ? accepted(rows.value.reduce(deleteRow, edits)) : rows)
}

function existing(edits: PendingEdits, row: RowTarget, context: EditContext): Reading<RowTarget> {
  const problem = row.isNew ? newRowProblem(edits, row.id) : missingRow(context, row.index)
  return problem === undefined ? accepted(row) : refused(problem)
}

// The rows of the cells, each once, in order.
function rowsOf(action: EditAction): RowTarget[] {
  return [...new Map(action.cells.map(({ row }) => [JSON.stringify(row), row])).values()]
}

// A copy of a row: the values the grid shows for it, except those the server gives (read-only cells,
// and a key it generates), which are left to their defaults.
function copyOf(
  edits: PendingEdits,
  row: RowTarget,
  context: EditContext,
): Reading<ReadonlyMap<number, PendingValue>> {
  if (row.isNew) {
    const source = edits.newRows.find(({ id }) => id === row.id)
    return source === undefined ? refused(NO_ROW) : accepted(source.cells)
  }
  return copyOfExisting(edits, row.index, context)
}

function copyOfExisting(
  edits: PendingEdits,
  index: number,
  context: EditContext,
): Reading<ReadonlyMap<number, PendingValue>> {
  const original = context.original(index)
  if (original === undefined) {
    return refused(NO_ROW)
  }
  const changed = edits.rows.get(index)?.cells ?? new Map<number, PendingValue>()
  return accepted(new Map([...copiedCells(context.table, original), ...changed]))
}

function copiedCells(table: EditableTable, row: Row): Map<number, PendingValue> {
  const cells = new Map<number, PendingValue>()
  table.columns.forEach((column, index) => {
    if (
      column.value.type !== ValueType.ReadOnly &&
      !(table.key.includes(index) && column.hasDefault)
    ) {
      cells.set(index, copied(row.at(index) ?? null))
    }
  })
  return cells
}

function copied(value: CellValue): PendingValue {
  return value === null
    ? { kind: PendingKind.Null }
    : { kind: PendingKind.Text, text: String(value) }
}
