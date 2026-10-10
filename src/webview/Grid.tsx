import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import {
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import {
  type CellPosition,
  extendSelection,
  type GridSelection,
  selectCell,
  selectionRange,
} from '../core/grid/selection.ts'
import { ExportFormat } from '../core/results/export-format.ts'
import { type ResultTab, TabStatus } from '../core/results/protocol.ts'
import type { ViewSpec } from '../core/results/view.ts'
import { canEditCell, gridRowCount, isEditing, rowEditAt } from './edit-overlay.ts'
import { handleGridKey } from './grid-keys.ts'
import { cellId, HEADER_HEIGHT, ROW_HEIGHT, scrollToShow } from './grid-model.ts'
import { GridHeader } from './GridHeader.tsx'
import { type CellEvents, GridRows, type RowLayout, type ShownEditor } from './GridRows.tsx'
import type { ResultsApi } from './results-api.ts'
import type { RowStore } from './row-store.ts'
import type { OpenEditor } from './use-cell-editor.ts'
import { type ColumnWindow, useColumnWindow } from './use-column-window.ts'
import { type GridTable, useGridTable } from './use-grid-table.ts'
import { useRowWindow } from './use-row-window.ts'

// What the grid does with the changes of its rows.
export interface GridEdit {
  readonly editor: OpenEditor | undefined
  readonly start: (position: CellPosition, typed: string | undefined) => void
  readonly deleteRows: () => void
  readonly preview: () => void
}

export interface GridProps {
  readonly api: ResultsApi
  readonly tab: ResultTab
  readonly store: RowStore
  readonly selection: GridSelection | undefined
  readonly onSelect: (selection: GridSelection) => void
  readonly onOpenDetail: (position: CellPosition) => void
  readonly onView: (view: ViewSpec) => void
  readonly onCopy: (format: ExportFormat) => void
  readonly edit: GridEdit
}

type ScrollRef = RefObject<HTMLDivElement | null>
type GridVirtualizer = Virtualizer<HTMLDivElement, Element>

interface GridModel {
  readonly table: GridTable
  readonly virtualizer: GridVirtualizer
  readonly widths: readonly number[]
  readonly shown: ColumnWindow
  readonly select: (selection: GridSelection) => void
}

const OVERSCAN = 20
// Before the page is laid out, the grid assumes this size; the real one replaces it at once.
const INITIAL_RECT = { width: 800, height: 600 }

// A virtualized grid over the rows the extension host holds: a million rows scroll smoothly because
// only those in view exist in the page, and only a few thousand are held here. The rows added in the
// grid follow the rows of the view.
export const Grid = (props: GridProps): ReactElement => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { table, virtualizer, widths, shown, select } = useGrid(props, scrollRef)
  useFocusAfterEditing(props.edit.editor !== undefined, scrollRef)
  const { tab, store } = props
  return (
    <div
      ref={scrollRef}
      {...gridAttributes(props)}
      onKeyDown={(event) => {
        onGridKey(event, props, { select, pageSize: pageSize(event.currentTarget) })
      }}
    >
      <GridHeader
        table={table}
        tab={tab}
        shown={shown}
        isDisabled={tab.status === TabStatus.Running}
        onView={props.onView}
      />
      <GridRows
        items={virtualizer.getVirtualItems()}
        totalSize={virtualizer.getTotalSize() + HEADER_HEIGHT}
        rowAt={(index) => (index < tab.rowCount ? store.row(index) : undefined)}
        layout={layoutOf(props, { widths, shown, totalWidth: table.getTotalSize(), select })}
        events={eventsOf(props, select)}
      />
    </div>
  )
}

function useGrid(props: GridProps, scrollRef: ScrollRef): GridModel {
  const table = useGridTable(props.tab, props.onView)
  const virtualizer = useGridVirtualizer(useShownRowCount(props.tab), scrollRef)
  useRowWindow(props.api, props.tab, { store: props.store, items: virtualizer.getVirtualItems() })
  useSyncExternalStore(props.store.subscribe, props.store.revision)
  const widths = table.getFlatHeaders().map((header) => header.getSize())
  const shown = useColumnWindow(widths, scrollRef)
  const select = (selection: GridSelection): void => {
    props.onSelect(selection)
    virtualizer.scrollToIndex(selection.focus.row)
    scrollRef.current?.scrollTo({
      left: revealedScroll(scrollRef.current, widths, selection.focus.column),
    })
  }
  return { table, virtualizer, widths, shown, select }
}

// While the rows are read again (after an apply, or to load them all) the grid keeps its height,
// so that it stays where it was scrolled to.
function useShownRowCount(tab: ResultTab): number {
  const count = gridRowCount(tab)
  const isRunning = tab.status === TabStatus.Running
  const [kept, setKept] = useState(count)
  if (!isRunning && kept !== count) {
    setKept(count)
  }
  return isRunning ? Math.max(count, kept) : count
}

// The focus comes back to the grid when an editor closes, for the keyboard to go on.
function useFocusAfterEditing(isEditorOpen: boolean, scrollRef: ScrollRef): void {
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (wasOpenRef.current && !isEditorOpen) {
      scrollRef.current?.focus()
    }
    wasOpenRef.current = isEditorOpen
  }, [isEditorOpen, scrollRef])
}

function useGridVirtualizer(rowCount: number, scrollRef: ScrollRef): GridVirtualizer {
  // eslint-disable-next-line react-hooks/incompatible-library -- sqldoro does not use the React Compiler: nothing memoizes the virtualizer's functions
  return useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin: HEADER_HEIGHT,
    initialRect: INITIAL_RECT,
  })
}

function gridAttributes({ tab, selection }: GridProps): Record<string, unknown> {
  return {
    className: 'grid',
    role: 'grid',
    'aria-label': 'Rows of the result',
    'aria-rowcount': gridRowCount(tab) + 1,
    'aria-colcount': tab.columns.length,
    'aria-multiselectable': true,
    'aria-readonly': !isEditing(tab),
    'aria-activedescendant':
      selection === undefined
        ? undefined
        : cellId(tab.id, selection.focus.row, selection.focus.column),
    tabIndex: 0,
  }
}

interface KeyContext {
  readonly select: (selection: GridSelection) => void
  readonly pageSize: number
}

function onGridKey(event: KeyboardEvent, props: GridProps, context: KeyContext): void {
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
    },
  )
}

interface Widths {
  readonly widths: readonly number[]
  readonly shown: ColumnWindow
  readonly totalWidth: number
  readonly select: (selection: GridSelection) => void
}

function layoutOf(props: GridProps, { widths, shown, totalWidth, select }: Widths): RowLayout {
  const { tab, selection } = props
  return {
    tabId: tab.id,
    columns: tab.columns,
    widths,
    shown,
    totalWidth,
    range: selection === undefined ? undefined : selectionRange(selection),
    focus: selection?.focus,
    isEditing: isEditing(tab),
    rowEdit: (index) => rowEditAt(tab, index),
    canEdit: (position) => canEditCell(tab, position),
    editor: shownEditor(props, select),
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
  return {
    view: editor.view,
    actions: {
      change: editor.change,
      cancel: editor.cancel,
      commit: (exit) => {
        if (editor.commit()) {
          const next = Math.min(Math.max(column + exit, 0), tab.columns.length - 1)
          select(selectCell({ row, column: next }))
        }
      },
    },
  }
}

function eventsOf(
  { selection, onOpenDetail, edit, tab }: GridProps,
  select: (selection: GridSelection) => void,
): CellEvents {
  return {
    onCellDown: (position, isExtending) => {
      select(
        isExtending && selection !== undefined
          ? extendSelection(selection, position)
          : selectCell(position),
      )
    },
    onCellOpen: (position) => {
      if (canEditCell(tab, position)) {
        edit.start(position, undefined)
        return
      }
      onOpenDetail(position)
    },
  }
}

// Rows a page up or down moves by: as many as fit in the grid.
function pageSize(element: HTMLDivElement): number {
  return Math.max(Math.floor((element.clientHeight - HEADER_HEIGHT) / ROW_HEIGHT), 1)
}

// The horizontal scroll that shows the column of the cell with the focus.
function revealedScroll(
  element: HTMLDivElement,
  widths: readonly number[],
  column: number,
): number {
  const start = totalOf(widths.slice(0, column))
  const end = totalOf(widths.slice(0, column + 1))
  return scrollToShow(
    { start: element.scrollLeft, size: element.clientWidth },
    { start, size: end - start },
  )
}

function totalOf(widths: readonly number[]): number {
  return widths.reduce((sum, width) => sum + width, 0)
}
