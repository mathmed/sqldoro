import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import {
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useRef,
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
import { handleGridKey } from './grid-keys.ts'
import { cellId, HEADER_HEIGHT, ROW_HEIGHT, scrollToShow } from './grid-model.ts'
import { GridHeader } from './GridHeader.tsx'
import { type CellEvents, GridRows, type RowLayout } from './GridRows.tsx'
import type { VsCodeApi } from './host.ts'
import type { RowStore } from './row-store.ts'
import { type GridTable, useGridTable } from './use-grid-table.ts'
import { useRowWindow } from './use-row-window.ts'

export interface GridProps {
  readonly api: VsCodeApi
  readonly tab: ResultTab
  readonly store: RowStore
  readonly selection: GridSelection | undefined
  readonly onSelect: (selection: GridSelection) => void
  readonly onOpenDetail: (position: CellPosition) => void
  readonly onView: (view: ViewSpec) => void
  readonly onCopy: (format: ExportFormat) => void
}

type ScrollRef = RefObject<HTMLDivElement | null>
type GridVirtualizer = Virtualizer<HTMLDivElement, Element>

interface GridModel {
  readonly table: GridTable
  readonly virtualizer: GridVirtualizer
  readonly widths: readonly number[]
  readonly select: (selection: GridSelection) => void
}

const OVERSCAN = 20
// Before the page is laid out, the grid assumes this size; the real one replaces it at once.
const INITIAL_RECT = { width: 800, height: 600 }

// A virtualized grid over the rows the extension host holds: a million rows scroll smoothly because
// only those in view exist in the page, and only a few thousand are held here.
export const Grid = (props: GridProps): ReactElement => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { table, virtualizer, widths, select } = useGrid(props, scrollRef)
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
        isDisabled={tab.status === TabStatus.Running}
        onView={props.onView}
      />
      <GridRows
        items={virtualizer.getVirtualItems()}
        totalSize={virtualizer.getTotalSize() + HEADER_HEIGHT}
        rowAt={(index) => store.row(index)}
        layout={layoutOf(props, { widths, totalWidth: table.getTotalSize() })}
        events={eventsOf(props, select)}
      />
    </div>
  )
}

function useGrid(props: GridProps, scrollRef: ScrollRef): GridModel {
  const table = useGridTable(props.tab, props.onView)
  const virtualizer = useGridVirtualizer(props.tab.rowCount, scrollRef)
  useRowWindow(props.api, props.tab, { store: props.store, items: virtualizer.getVirtualItems() })
  useSyncExternalStore(props.store.subscribe, props.store.revision)
  const widths = table.getFlatHeaders().map((header) => header.getSize())
  const select = (selection: GridSelection): void => {
    props.onSelect(selection)
    virtualizer.scrollToIndex(selection.focus.row)
    scrollRef.current?.scrollTo({
      left: revealedScroll(scrollRef.current, widths, selection.focus.column),
    })
  }
  return { table, virtualizer, widths, select }
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
    'aria-rowcount': tab.rowCount + 1,
    'aria-colcount': tab.columns.length,
    'aria-multiselectable': true,
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
  const bounds = {
    rowCount: props.tab.rowCount,
    columnCount: props.tab.columns.length,
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
    },
  )
}

interface Widths {
  readonly widths: readonly number[]
  readonly totalWidth: number
}

function layoutOf({ tab, selection }: GridProps, { widths, totalWidth }: Widths): RowLayout {
  return {
    tabId: tab.id,
    columns: tab.columns,
    widths,
    totalWidth,
    range: selection === undefined ? undefined : selectionRange(selection),
    focus: selection?.focus,
  }
}

function eventsOf(
  { selection, onOpenDetail }: GridProps,
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
    onCellOpen: onOpenDetail,
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
