import { PendingKind, type PendingValue } from '../core/edits/pending.ts'
import { type ValueSpec, ValueType } from '../core/engine/table.ts'
import type { CellPosition } from '../core/grid/selection.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import { EditingState } from '../core/results/tab-editing.ts'

// How a row of the grid stands: as the query returned it, changed, added in the grid, or marked
// for deletion.
export const RowLook = {
  Changed: 'changed',
  Added: 'added',
  Deleted: 'deleted',
} as const

export type RowLook = (typeof RowLook)[keyof typeof RowLook]

export interface RowEdit {
  readonly look: RowLook
  readonly cells: ReadonlyMap<number, PendingValue>
  // Why the last apply did not take it; empty otherwise.
  readonly problem: string
}

// NULL and DEFAULT are words of SQL, not text: each has its own look.
const KeywordLook = {
  Null: 'null',
  Default: 'default',
} as const

type KeywordLook = (typeof KeywordLook)[keyof typeof KeywordLook]

export interface PendingDisplay {
  readonly text: string
  // The look of NULL and DEFAULT; undefined for text.
  readonly keyword: KeywordLook | undefined
}

const DEFAULT_DISPLAY: PendingDisplay = { text: 'DEFAULT', keyword: KeywordLook.Default }
const NULL_DISPLAY: PendingDisplay = { text: 'NULL', keyword: KeywordLook.Null }

// Rows of the grid: those of the view, then the rows added in the grid.
export function gridRowCount(tab: ResultTab): number {
  return tab.rowCount + tab.editing.newRows.length
}

export function isEditing(tab: ResultTab): boolean {
  return tab.editing.state === EditingState.Editable
}

// The changes of a row of the grid; undefined for a row of the view as the query returned it.
export function rowEditAt(tab: ResultTab, index: number): RowEdit | undefined {
  if (index >= tab.rowCount) {
    const added = tab.editing.newRows.at(index - tab.rowCount)
    return added === undefined ? undefined : rowEdit(RowLook.Added, added)
  }
  const changed = tab.editing.rows.find(({ row }) => row === index)
  if (changed === undefined) {
    return undefined
  }
  return rowEdit(changed.isDeleted ? RowLook.Deleted : RowLook.Changed, changed)
}

function rowEdit(
  look: RowLook,
  {
    cells,
    problem,
  }: {
    readonly cells: readonly { readonly column: number; readonly value: PendingValue }[]
    readonly problem: string
  },
): RowEdit {
  return { look, cells: new Map(cells.map(({ column, value }) => [column, value])), problem }
}

// The spec of a column the grid can change, while the rows can be edited.
function editableSpec(tab: ResultTab, column: number): ValueSpec | undefined {
  const spec = isEditing(tab) ? tab.editing.columns.at(column) : undefined
  return spec?.type === ValueType.ReadOnly ? undefined : spec
}

// How a cell takes values, when it does: its column can be changed and its row is not marked for
// deletion.
export function cellSpec(tab: ResultTab, position: CellPosition): ValueSpec | undefined {
  return rowEditAt(tab, position.row)?.look === RowLook.Deleted
    ? undefined
    : editableSpec(tab, position.column)
}

export function canEditCell(tab: ResultTab, position: CellPosition): boolean {
  return cellSpec(tab, position) !== undefined
}

// What a pending cell shows; a cell of a new row the grid left alone gets its default.
export function pendingDisplay(value: PendingValue | undefined): PendingDisplay {
  if (value?.kind === PendingKind.Text) {
    return { text: value.text, keyword: undefined }
  }
  return value?.kind === PendingKind.Null ? NULL_DISPLAY : DEFAULT_DISPLAY
}

// The text an editor starts from for a pending cell: what was typed, or nothing for NULL and DEFAULT.
export function pendingDraft(value: PendingValue): string {
  return value.kind === PendingKind.Text ? value.text : ''
}
