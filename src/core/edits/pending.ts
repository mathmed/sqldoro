import type { CellValue } from '../engine/query.ts'

// What a cell will hold once the changes are applied: text typed in the grid (checked against its
// column), NULL, or the default of its column.
export const PendingKind = {
  Text: 'text',
  Null: 'null',
  Default: 'default',
} as const

export type PendingKind = (typeof PendingKind)[keyof typeof PendingKind]

export type PendingValue =
  | { readonly kind: typeof PendingKind.Text; readonly text: string }
  | { readonly kind: typeof PendingKind.Null }
  | { readonly kind: typeof PendingKind.Default }

// The changes to a row the query returned: new values by result column, and whether it is to be
// deleted (its new values stay, for when the deletion is reverted).
export interface RowChange {
  readonly cells: ReadonlyMap<number, PendingValue>
  readonly isDeleted: boolean
}

// A row added in the grid: the values given so far, the others left to their defaults.
export interface NewRow {
  readonly id: number
  readonly cells: ReadonlyMap<number, PendingValue>
}

export interface PendingEdits {
  // By the position of the row in the result, whatever the view shows.
  readonly rows: ReadonlyMap<number, RowChange>
  readonly newRows: readonly NewRow[]
  // New rows are never given an id twice.
  readonly nextId: number
}

// A row of the result, by its position in it, or a row added in the grid, by its id.
export type RowTarget =
  { readonly isNew: false; readonly index: number } | { readonly isNew: true; readonly id: number }

export interface CellChange {
  readonly row: RowTarget
  readonly column: number
  readonly value: PendingValue
  // What the cell of a row of the result holds; ignored for new rows.
  readonly original: CellValue
}

export const NO_EDITS: PendingEdits = { rows: new Map(), newRows: [], nextId: 1 }

const NO_CHANGE: RowChange = { cells: new Map(), isDeleted: false }

export function changedRowCount(edits: PendingEdits): number {
  return edits.rows.size + edits.newRows.length
}

// A value equal to what a row of the result holds is no change at all.
export function setCell(edits: PendingEdits, change: CellChange): PendingEdits {
  const { row, column, value } = change
  if (row.isNew) {
    return withNewCells(edits, row.id, (cells) => withCell(cells, column, value))
  }
  const isSame = isOriginal(value, change.original)
  return withRowCells(edits, row.index, (cells) =>
    isSame ? withoutCell(cells, column) : withCell(cells, column, value),
  )
}

export function isOriginal(value: PendingValue, original: CellValue): boolean {
  if (value.kind === PendingKind.Text) {
    return original !== null && String(original) === value.text
  }
  return value.kind === PendingKind.Null && original === null
}

// A deleted row comes back first; another revert then drops its values. A new row's values go back
// to their defaults.
export function revertCell(edits: PendingEdits, row: RowTarget, column: number): PendingEdits {
  if (row.isNew) {
    return withNewCells(edits, row.id, (cells) => withoutCell(cells, column))
  }
  const change = edits.rows.get(row.index)
  if (change?.isDeleted === true) {
    return withRowChange(edits, row.index, { ...change, isDeleted: false })
  }
  return withRowCells(edits, row.index, (cells) => withoutCell(cells, column))
}

// A row of the result is marked; a new row simply goes.
export function deleteRow(edits: PendingEdits, row: RowTarget): PendingEdits {
  if (row.isNew) {
    return { ...edits, newRows: edits.newRows.filter(({ id }) => id !== row.id) }
  }
  const change = edits.rows.get(row.index) ?? NO_CHANGE
  return withRowChange(edits, row.index, { ...change, isDeleted: true })
}

export function addRow(
  edits: PendingEdits,
  cells: ReadonlyMap<number, PendingValue>,
): PendingEdits {
  return {
    ...edits,
    newRows: [...edits.newRows, { id: edits.nextId, cells }],
    nextId: edits.nextId + 1,
  }
}

export function revertAll(edits: PendingEdits): PendingEdits {
  return { ...NO_EDITS, nextId: edits.nextId }
}

function withRowCells(
  edits: PendingEdits,
  index: number,
  change: (cells: ReadonlyMap<number, PendingValue>) => ReadonlyMap<number, PendingValue>,
): PendingEdits {
  const current = edits.rows.get(index) ?? NO_CHANGE
  return withRowChange(edits, index, { ...current, cells: change(current.cells) })
}

// A row without new values that is not deleted has no change left.
function withRowChange(edits: PendingEdits, index: number, change: RowChange): PendingEdits {
  const rows = new Map(edits.rows)
  if (change.cells.size === 0 && !change.isDeleted) {
    rows.delete(index)
  } else {
    rows.set(index, change)
  }
  return { ...edits, rows }
}

function withNewCells(
  edits: PendingEdits,
  id: number,
  change: (cells: ReadonlyMap<number, PendingValue>) => ReadonlyMap<number, PendingValue>,
): PendingEdits {
  return {
    ...edits,
    newRows: edits.newRows.map((row) => (row.id === id ? { id, cells: change(row.cells) } : row)),
  }
}

function withCell(
  cells: ReadonlyMap<number, PendingValue>,
  column: number,
  value: PendingValue,
): ReadonlyMap<number, PendingValue> {
  return new Map(cells).set(column, value)
}

function withoutCell(
  cells: ReadonlyMap<number, PendingValue>,
  column: number,
): ReadonlyMap<number, PendingValue> {
  const next = new Map(cells)
  next.delete(column)
  return next
}
