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
  // Whether the cell takes a value, and editing it: from its value, or from what was typed.
  readonly canEdit: (position: CellPosition) => boolean
  readonly edit: (position: CellPosition, typed: string | undefined) => void
  readonly deleteRows: () => void
  readonly preview: () => void
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
const FIRST_SELECTION: GridSelection = selectCell({ row: 0, column: 0 })

// Says whether it acted: a key the grid did not use goes on to the page.
type KeyHandler = (selection: GridSelection, actions: GridKeyActions) => boolean

const OPEN_DETAIL: KeyHandler = (selection, actions) => {
  actions.openDetail(selection.focus)
  return true
}

// Enter edits a cell that takes values, and shows the whole value of any other.
const EDIT_OR_OPEN: KeyHandler = (selection, actions) => {
  if (actions.canEdit(selection.focus)) {
    actions.edit(selection.focus, undefined)
    return true
  }
  actions.openDetail(selection.focus)
  return true
}

const PLAIN_KEYS: ReadonlyMap<string, KeyHandler> = new Map([
  ['Enter', EDIT_OR_OPEN],
  ['F2', typedHandler(undefined)],
  [
    'Delete',
    (...[, actions]) => {
      actions.deleteRows()
      return true
    },
  ],
])
const SHIFT_KEYS: ReadonlyMap<string, KeyHandler> = new Map([['Enter', OPEN_DETAIL]])
const CONTROL_KEYS: ReadonlyMap<string, KeyHandler> = new Map([
  [
    'c',
    (...[, actions]) => {
      actions.copy()
      return true
    },
  ],
  [
    's',
    (...[, actions]) => {
      actions.preview()
      return true
    },
  ],
])

// The keyboard of a spreadsheet: arrows, Page Up and Down, Home and End (with Ctrl or Cmd, of the
// grid), Shift to extend, Ctrl or Cmd with A to select all, C to copy and S to preview the changes;
// Enter or F2 (or typing) to edit a cell, Shift+Enter for its whole value, Delete to delete rows.
export function handleGridKey(
  event: KeyboardEvent,
  {
    selection,
    bounds,
  }: { readonly selection: GridSelection | undefined; readonly bounds: GridBounds },
  actions: GridKeyActions,
): void {
  const handler = handlerOf(event, bounds)
  if (handler?.(selection ?? FIRST_SELECTION, actions) === true) {
    event.preventDefault()
  }
}

// Keys pressed in the filters of the header, or on an empty grid, are not the grid's.
function handlerOf(event: KeyboardEvent, bounds: GridBounds): KeyHandler | undefined {
  return event.target === event.currentTarget && bounds.rowCount > 0
    ? keyHandler(event, bounds)
    : undefined
}

interface MoveOptions {
  readonly isExtending: boolean
  readonly bounds: GridBounds
}

function keyHandler(event: KeyboardEvent, bounds: GridBounds): KeyHandler | undefined {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  return event.ctrlKey || event.metaKey
    ? controlHandler(key, bounds)
    : plainHandler(event, { isExtending: event.shiftKey, bounds })
}

function plainHandler(event: KeyboardEvent, options: MoveOptions): KeyHandler | undefined {
  const special = (options.isExtending ? SHIFT_KEYS : PLAIN_KEYS).get(event.key)
  return special ?? typingHandler(event) ?? moveHandlerOf(event.key, options)
}

// A character typed on a cell starts editing it.
function typingHandler(event: KeyboardEvent): KeyHandler | undefined {
  return event.key.length === 1 && !event.altKey ? typedHandler(event.key) : undefined
}

function moveHandlerOf(key: string, options: MoveOptions): KeyHandler | undefined {
  const move = MOVES.get(key)
  return move === undefined ? undefined : moveHandler(move, options)
}

// Editing the cell with the focus, from what was typed, when it takes values.
function typedHandler(typed: string | undefined): KeyHandler {
  return (selection, actions) => {
    const canEdit = actions.canEdit(selection.focus)
    if (canEdit) {
      actions.edit(selection.focus, typed)
    }
    return canEdit
  }
}

function controlHandler(key: string, bounds: GridBounds): KeyHandler | undefined {
  if (key === 'a') {
    return (...[, actions]) => {
      actions.select(selectAll(bounds))
      return true
    }
  }
  const handler = CONTROL_KEYS.get(key)
  const move = CONTROL_MOVES.get(key)
  return (
    handler ?? (move === undefined ? undefined : moveHandler(move, { isExtending: false, bounds }))
  )
}

function moveHandler(
  move: Move,
  { isExtending, bounds }: { readonly isExtending: boolean; readonly bounds: GridBounds },
): KeyHandler {
  return (selection, actions) => {
    actions.select(moveSelection(selection, { move, isExtending }, bounds))
    return true
  }
}
