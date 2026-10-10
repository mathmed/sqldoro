import type { KeyboardEvent } from 'react'

import {
  type CellPosition,
  type GridBounds,
  type GridSelection,
  type Move,
  Moves,
  moveSelection,
  selectAll,
  selectCell,
} from '../core/grid/selection.ts'

export interface GridKeyActions {
  readonly select: (selection: GridSelection) => void
  readonly copy: () => void
  readonly openDetail: (position: CellPosition) => void
}

const MOVES: ReadonlyMap<string, Move> = new Map([
  ['ArrowUp', Moves.up],
  ['ArrowDown', Moves.down],
  ['ArrowLeft', Moves.left],
  ['ArrowRight', Moves.right],
  ['PageUp', Moves.pageUp],
  ['PageDown', Moves.pageDown],
  ['Home', Moves.rowStart],
  ['End', Moves.rowEnd],
])
const CONTROL_MOVES: ReadonlyMap<string, Move> = new Map([
  ['Home', Moves.gridStart],
  ['End', Moves.gridEnd],
])
const FIRST_CELL: CellPosition = { row: 0, column: 0 }

type KeyHandler = (selection: GridSelection, actions: GridKeyActions) => void

// The keyboard of a spreadsheet: arrows, Page Up and Down, Home and End (with Ctrl or Cmd, of the
// grid), Shift to extend, Ctrl or Cmd with A to select all and C to copy, Enter for the value.
export function handleGridKey(
  event: KeyboardEvent,
  {
    selection,
    bounds,
  }: { readonly selection: GridSelection | undefined; readonly bounds: GridBounds },
  actions: GridKeyActions,
): void {
  const handler = event.target === event.currentTarget ? keyHandler(event, bounds) : undefined
  if (handler !== undefined && bounds.rowCount > 0) {
    event.preventDefault()
    handler(selection ?? selectCell(FIRST_CELL), actions)
  }
}

interface MoveOptions {
  readonly isExtending: boolean
  readonly bounds: GridBounds
}

const OPEN_DETAIL: KeyHandler = (selection, actions) => {
  actions.openDetail(selection.focus)
}

function keyHandler(event: KeyboardEvent, bounds: GridBounds): KeyHandler | undefined {
  const isControl = event.ctrlKey || event.metaKey
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  return isControl
    ? controlHandler(key, bounds)
    : plainHandler(key, { isExtending: event.shiftKey, bounds })
}

function plainHandler(key: string, options: MoveOptions): KeyHandler | undefined {
  if (key === 'Enter') {
    return OPEN_DETAIL
  }
  const move = MOVES.get(key)
  return move === undefined ? undefined : moveHandler(move, options)
}

function controlHandler(key: string, bounds: GridBounds): KeyHandler | undefined {
  if (key === 'a') {
    return (...[, actions]) => {
      actions.select(selectAll(bounds))
    }
  }
  if (key === 'c') {
    return (...[, actions]) => {
      actions.copy()
    }
  }
  const move = CONTROL_MOVES.get(key)
  return move === undefined ? undefined : moveHandler(move, { isExtending: false, bounds })
}

function moveHandler(
  move: Move,
  { isExtending, bounds }: { readonly isExtending: boolean; readonly bounds: GridBounds },
): KeyHandler {
  return (selection, actions) => {
    actions.select(moveSelection(selection, { move, isExtending }, bounds))
  }
}
