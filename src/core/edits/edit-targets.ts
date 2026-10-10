import type { Row } from '../engine/query.ts'
import type { CellRange, EditMessage } from '../results/protocol.ts'
import { groupDigits } from '../results/tabs.ts'
import { type CellTarget, MAX_CHANGED_ROWS } from './edit-actions.ts'
import { EditKind } from './edit-kind.ts'
import type { PendingEdits, RowTarget } from './pending.ts'

// The rows of a result as the editing of its tab reads them.
export interface RowSource {
  // Rows in the view, after its filters.
  readonly rowCount: number
  // The position in the result of the row a view position shows; undefined past the view.
  readonly sourceIndex: (viewRow: number) => number | undefined
  // Where the view shows each of these rows of the result; rows its filters hide are left out.
  readonly viewPositions: (indexes: readonly number[]) => ReadonlyMap<number, number>
  // The row of the result at a position, as the query returned it.
  readonly sourceRow: (index: number) => Row | undefined
}

export interface TargetSource {
  readonly rows: RowSource
  readonly edits: PendingEdits
  readonly columnCount: number
}

export type TargetsReading =
  { readonly cells: readonly CellTarget[] } | { readonly problem: string }

// Deleting and duplicating act on rows: one cell of each names it.
const ROW_KINDS: ReadonlySet<EditKind> = new Set<EditKind>([EditKind.Delete, EditKind.Duplicate])
const ROW_COLUMN = [0]
const TOO_MANY = `Select at most ${groupDigits(MAX_CHANGED_ROWS)} rows to change at a time.`

// The cells an edit of the grid acts on: positions of the view are rows of the result, and past them
// the rows added in the grid. Reverting only looks at the rows that have changes.
export function editTargets(edit: EditMessage, source: TargetSource): TargetsReading {
  const { range } = edit
  if (range === null) {
    return { cells: [] }
  }
  if (edit.kind === EditKind.Revert) {
    return { cells: cellsOf(changedRows(range, source), columnsOf(range, source.columnCount)) }
  }
  if (range.lastRow - range.firstRow + 1 > MAX_CHANGED_ROWS) {
    return { problem: TOO_MANY }
  }
  const columns = ROW_KINDS.has(edit.kind) ? ROW_COLUMN : columnsOf(range, source.columnCount)
  return { cells: cellsOf(rowsOf(range, source), columns) }
}

function cellsOf(rows: readonly RowTarget[], columns: readonly number[]): CellTarget[] {
  return rows.flatMap((row) => columns.map((column) => ({ row, column })))
}

function columnsOf(range: CellRange, columnCount: number): number[] {
  const last = Math.min(range.lastColumn, columnCount - 1)
  return Array.from(
    { length: Math.max(last - range.firstColumn + 1, 0) },
    (...[, offset]) => range.firstColumn + offset,
  )
}

function rowsOf(range: CellRange, source: TargetSource): RowTarget[] {
  const count = range.lastRow - range.firstRow + 1
  return Array.from({ length: count }, (...[, offset]) => range.firstRow + offset).flatMap(
    (position) => rowAt(position, source),
  )
}

function rowAt(position: number, { rows, edits }: TargetSource): RowTarget[] {
  const index = rows.sourceIndex(position)
  if (index !== undefined) {
    return [{ isNew: false, index }]
  }
  const added = edits.newRows.at(position - rows.rowCount)
  return added === undefined ? [] : [{ isNew: true, id: added.id }]
}

// The rows of the range that have changes: those of the result the view shows there, and the new
// rows there.
function changedRows(range: CellRange, { rows, edits }: TargetSource): RowTarget[] {
  const isInRange = (position: number): boolean =>
    position >= range.firstRow && position <= range.lastRow
  const positions = rows.viewPositions([...edits.rows.keys()])
  const existing = [...positions]
    .filter(([, position]) => isInRange(position))
    .map(([index]): RowTarget => ({ isNew: false, index }))
  const added = edits.newRows
    .filter((...[, offset]) => isInRange(rows.rowCount + offset))
    .map(({ id }): RowTarget => ({ isNew: true, id }))
  return [...existing, ...added]
}
