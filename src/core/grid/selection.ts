import type { CellRange } from '../results/protocol.ts'

export interface CellPosition {
  readonly row: number
  readonly column: number
}

// A rectangle of cells: from where the selection started to the cell that has the focus.
export interface GridSelection {
  readonly anchor: CellPosition
  readonly focus: CellPosition
}

export interface GridBounds {
  readonly rowCount: number
  readonly columnCount: number
  // Rows a page up or down moves by.
  readonly pageSize: number
}

export type Move = (position: CellPosition, bounds: GridBounds) => CellPosition

export interface Navigation {
  readonly move: Move
  // Shift held: the focus moves and the anchor stays.
  readonly isExtending: boolean
}

export const Moves = {
  up: (position) => ({ ...position, row: position.row - 1 }),
  down: (position) => ({ ...position, row: position.row + 1 }),
  left: (position) => ({ ...position, column: position.column - 1 }),
  right: (position) => ({ ...position, column: position.column + 1 }),
  rowStart: (position) => ({ ...position, column: 0 }),
  rowEnd: (position, bounds) => ({ ...position, column: bounds.columnCount - 1 }),
  pageUp: (position, bounds) => ({ ...position, row: position.row - bounds.pageSize }),
  pageDown: (position, bounds) => ({ ...position, row: position.row + bounds.pageSize }),
  gridStart: () => ({ row: 0, column: 0 }),
  gridEnd: (...[, bounds]) => ({ row: bounds.rowCount - 1, column: bounds.columnCount - 1 }),
} as const satisfies Readonly<Record<string, Move>>

function clamp(value: number, last: number): number {
  return Math.min(Math.max(value, 0), Math.max(last, 0))
}

export function clampPosition(position: CellPosition, bounds: GridBounds): CellPosition {
  return {
    row: clamp(position.row, bounds.rowCount - 1),
    column: clamp(position.column, bounds.columnCount - 1),
  }
}

export function selectCell(position: CellPosition): GridSelection {
  return { anchor: position, focus: position }
}

export function extendSelection(selection: GridSelection, focus: CellPosition): GridSelection {
  return { anchor: selection.anchor, focus }
}

export function selectAll(bounds: GridBounds): GridSelection {
  const anchor = Moves.gridStart()
  return { anchor, focus: clampPosition(Moves.gridEnd(anchor, bounds), bounds) }
}

export function moveSelection(
  selection: GridSelection,
  { move, isExtending }: Navigation,
  bounds: GridBounds,
): GridSelection {
  const focus = clampPosition(move(selection.focus, bounds), bounds)
  return isExtending ? extendSelection(selection, focus) : selectCell(focus)
}

// After the rows change (a filter, a new result), the selection stays inside the grid.
export function clampSelection(selection: GridSelection, bounds: GridBounds): GridSelection {
  return {
    anchor: clampPosition(selection.anchor, bounds),
    focus: clampPosition(selection.focus, bounds),
  }
}

export function selectionRange({ anchor, focus }: GridSelection): CellRange {
  return {
    firstRow: Math.min(anchor.row, focus.row),
    lastRow: Math.max(anchor.row, focus.row),
    firstColumn: Math.min(anchor.column, focus.column),
    lastColumn: Math.max(anchor.column, focus.column),
  }
}

export function isSelected(range: CellRange, position: CellPosition): boolean {
  return (
    position.row >= range.firstRow &&
    position.row <= range.lastRow &&
    position.column >= range.firstColumn &&
    position.column <= range.lastColumn
  )
}
