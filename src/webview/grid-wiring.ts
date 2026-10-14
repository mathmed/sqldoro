import type { KeyboardEvent } from 'react'

import {
  type CellPosition,
  extendSelection,
  extendToRow,
  type GridSelection,
  selectCell,
  selectionRange,
  selectRow,
} from '../core/grid/selection.ts'
import { ExportFormat } from '../core/results/export-format.ts'
import { canEditCell, gridRowCount, isEditing, rowEditAt } from './edit-overlay.ts'
import { handleGridKey } from './grid-keys.ts'
import { cellId } from './grid-model.ts'
import type { GridProps } from './grid-props.ts'
import type { CellEvents, RowLayout, ShownEditor } from './GridRows.tsx'
import { placeUnder } from './popup.ts'
import type { ColumnWindow } from './use-column-window.ts'
import type { PeekHover } from './use-peek-hover.ts'

export interface Widths {
  readonly widths: readonly number[]
  readonly shown: ColumnWindow
  readonly gutter: number
  readonly totalWidth: number
  readonly select: (selection: GridSelection) => void
}

export function layoutOf(props: GridProps, sizes: Widths): RowLayout {
  const { tab, selection, links } = props
  return {
    tabId: tab.id,
    columns: tab.columns,
    widths: sizes.widths,
    gutter: sizes.gutter,
    rowCount: tab.rowCount,
    shown: sizes.shown,
    totalWidth: sizes.totalWidth,
    range: selection === undefined ? undefined : selectionRange(selection),
    focus: selection?.focus,
    isEditing: isEditing(tab),
    rowEdit: (index) => rowEditAt(tab, index),
    canEdit: (position) => canEditCell(tab, position),
    editor: shownEditor(props, sizes.select),
    isLink: links.actions.isLink,
    canOpenInPlace: links.actions.canOpenInPlace,
  }
}

// Putting a value in moves on along its row with Tab, as in a spreadsheet.
function shownEditor(
  { edit, tab }: GridProps,
  select: (selection: GridSelection) => void,
): ShownEditor | undefined {
  const { editor } = edit
  if (editor === undefined) {
    return undefined
  }
  const { row, column } = editor.view.position
  const moveOn = (isClosing: boolean, exit: number): void => {
    if (isClosing) {
      const next = Math.min(Math.max(column + exit, 0), tab.columns.length - 1)
      select(selectCell({ row, column: next }))
    }
  }
  return {
    view: editor.view,
    actions: {
      change: editor.change,
      cancel: editor.cancel,
      commit: (exit) => {
        moveOn(editor.commit(), exit)
      },
      put: (text, exit) => {
        moveOn(editor.put(text), exit)
      },
    },
  }
}

export function eventsOf(
  props: GridProps,
  {
    select,
    hover,
  }: { readonly select: (selection: GridSelection) => void; readonly hover: PeekHover },
): CellEvents {
  const { links } = props
  return {
    ...selectionEvents(props, select),
    onCellOpen: (position) => {
      openCell(props, position)
    },
    onLinkOpen: links.actions.open,
    onCellMenu: (position, place) => {
      select(selectCell(position))
      links.onCellMenu(position, place)
    },
    onLinkHover: hover,
  }
}

function selectionEvents(
  { selection, tab, onSelect }: GridProps,
  select: (selection: GridSelection) => void,
): Pick<CellEvents, 'onCellDown' | 'onRowDown'> {
  const columnCount = tab.columns.length
  return {
    // The row is in view already: the grid does not scroll to its last column.
    onRowDown: (row, isExtending) => {
      onSelect(
        isExtending && selection !== undefined
          ? extendToRow(selection, row, columnCount)
          : selectRow(row, columnCount),
      )
    },
    onCellDown: (position, isExtending) => {
      select(
        isExtending && selection !== undefined
          ? extendSelection(selection, position)
          : selectCell(position),
      )
    },
  }
}

// A double click edits a cell that takes values, and shows the whole value of any other.
function openCell({ tab, edit, onOpenDetail }: GridProps, position: CellPosition): void {
  if (canEditCell(tab, position)) {
    edit.start(position, undefined)
    return
  }
  onOpenDetail(position)
}

interface KeyContext {
  readonly select: (selection: GridSelection) => void
  readonly pageSize: number
}

export function onGridKey(event: KeyboardEvent, props: GridProps, context: KeyContext): void {
  const { tab, edit } = props
  const bounds = {
    rowCount: gridRowCount(tab),
    columnCount: tab.columns.length,
    pageSize: context.pageSize,
  }
  handleGridKey(
    event,
    { selection: props.selection, bounds },
    {
      select: context.select,
      copy: () => {
        props.onCopy(ExportFormat.Tsv)
      },
      openDetail: props.onOpenDetail,
      canEdit: (position) => canEditCell(tab, position),
      edit: edit.start,
      deleteRows: edit.deleteRows,
      preview: edit.preview,
      ...linkKeys(props),
    },
  )
}

function valueAt(
  { store, tab }: Pick<GridProps, 'store' | 'tab'>,
  position: CellPosition,
): unknown {
  return store.row(position.row, tab.viewVersion)?.cells.at(position.column)
}

// The keys of a link act on the cell with the focus, where it is laid out: Ctrl+Enter follows the
// link in place, where the panel keeps a trail.
function linkKeys({ links, store, tab }: GridProps): {
  readonly openLink: (position: CellPosition) => boolean
  readonly peek: (position: CellPosition) => boolean
  readonly openMenu: (position: CellPosition) => void
} {
  const isLink = (position: CellPosition): boolean =>
    links.actions.isLink(position, valueAt({ store, tab }, position))
  const placeOf = (position: CellPosition): ReturnType<typeof placeUnder> =>
    placeUnder(document.getElementById(cellId(tab.id, position.row, position.column)))
  return {
    openLink: (position) => {
      const isOpening = isLink(position)
      if (isOpening) {
        links.actions.open(position, true)
      }
      return isOpening
    },
    peek: (position) => {
      const isPeeking = isLink(position)
      if (isPeeking) {
        links.onPeek(position, placeOf(position))
      }
      return isPeeking
    },
    openMenu: (position) => {
      links.onCellMenu(position, placeOf(position))
    },
  }
}
