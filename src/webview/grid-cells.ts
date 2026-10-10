import type { ColumnKind } from '../core/engine/query.ts'
import type { CellPosition } from '../core/grid/selection.ts'
import type { WireRow } from '../core/results/protocol.ts'
import { displayCell } from './cell-display.ts'
import { pendingDisplay, type RowEdit, RowLook } from './edit-overlay.ts'

// A cell of the grid: where, what its column holds, its row as the grid holds it, and the changes
// of that row.
export interface CellState {
  readonly position: CellPosition
  readonly kind: ColumnKind
  readonly row: WireRow | undefined
  readonly edit: RowEdit | undefined
}

export interface CellLook {
  readonly className: string
  readonly text: string
}

interface Marks {
  readonly isInSelection: boolean
  readonly isFocus: boolean
}

const LOADING = { text: '', look: 'loading' }
const NOTES: ReadonlyMap<RowLook, string> = new Map([
  [RowLook.Added, 'in a new row'],
  [RowLook.Deleted, 'in a row marked for deletion'],
])

// A row the grid does not hold yet is loading; a changed row says how.
export function rowClassName(row: WireRow | undefined, edit: RowEdit | undefined): string {
  return ['grid-row', ...loadingClass(row, edit), ...editClasses(edit)].join(' ')
}

function loadingClass(row: WireRow | undefined, edit: RowEdit | undefined): string[] {
  return row === undefined && edit?.look !== RowLook.Added ? ['loading'] : []
}

function editClasses(edit: RowEdit | undefined): string[] {
  if (edit === undefined) {
    return []
  }
  return edit.problem === '' ? [`row-${edit.look}`] : [`row-${edit.look}`, 'has-problem']
}

// How a cell reads: its new value when it has one (NULL and DEFAULT as words), else the value of the
// row, NULL apart from empty, with a mark when it was cut.
export function cellDisplay(cell: CellState, marks: Marks): CellLook {
  const display = isPendingCell(cell) ? pendingLook(cell) : heldLook(cell)
  return { className: cellClassName(display.look, { cell, marks }), text: display.text }
}

function isPendingCell(cell: CellState): boolean {
  return cell.edit?.cells.has(cell.position.column) === true || cell.edit?.look === RowLook.Added
}

function cellClassName(
  look: string,
  { cell, marks }: { readonly cell: CellState; readonly marks: Marks },
): string {
  return [
    'grid-cell',
    `look-${look}`,
    cell.edit?.cells.has(cell.position.column) === true ? 'pending' : '',
    marks.isInSelection ? 'selected' : '',
    marks.isFocus ? 'focused' : '',
  ]
    .filter((name) => name !== '')
    .join(' ')
}

function pendingLook(cell: CellState): { readonly text: string; readonly look: string } {
  const display = pendingDisplay(cell.edit?.cells.get(cell.position.column))
  return display.keyword === undefined
    ? displayCell(display.text, cell.kind)
    : { text: display.text, look: display.keyword }
}

function heldLook({ position, kind, row }: CellState): {
  readonly text: string
  readonly look: string
} {
  if (row === undefined) {
    return LOADING
  }
  const display = displayCell(row.cells.at(position.column) ?? null, kind)
  return row.truncated.includes(position.column)
    ? { ...display, text: `${display.text}…` }
    : display
}

// What a screen reader says beside the value: that it changed, and where it stands.
export function cellNote(cell: CellState): string | undefined {
  const parts = [changedNote(cell), whereNote(cell.edit)].filter((part) => part !== '')
  return parts.length === 0 ? undefined : parts.join(', ')
}

function changedNote(cell: CellState): string {
  return cell.edit?.cells.has(cell.position.column) === true ? 'changed' : ''
}

function whereNote(edit: RowEdit | undefined): string {
  return edit === undefined ? '' : (NOTES.get(edit.look) ?? '')
}
