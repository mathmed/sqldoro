import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import {
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react'

import type { GridSelection } from '../core/grid/selection.ts'
import { TabStatus, WebviewMessageType } from '../core/results/protocol.ts'
import { gridRowCount, isEditing } from './edit-overlay.ts'
import { cellId, HEADER_HEIGHT, ROW_HEIGHT, rowNumberWidth } from './grid-model.ts'
import type { GridProps } from './grid-props.ts'
import { pageSize, revealedScroll } from './grid-scroll.ts'
import { eventsOf, layoutOf, onGridKey } from './grid-wiring.ts'
import { GridHeader } from './GridHeader.tsx'
import { GridRows } from './GridRows.tsx'
import { type ColumnWindow, useColumnWindow } from './use-column-window.ts'
import { type GridTable, useGridTable } from './use-grid-table.ts'
import { usePeekHover } from './use-peek-hover.ts'
import { useRowWindow } from './use-row-window.ts'
import { useStepScroll } from './use-step-scroll.ts'

type ScrollRef = RefObject<HTMLDivElement | null>
type GridVirtualizer = Virtualizer<HTMLDivElement, Element>

interface GridModel {
  readonly table: GridTable
  readonly virtualizer: GridVirtualizer
  readonly widths: readonly number[]
  readonly shown: ColumnWindow
  // The width of the row numbers.
  readonly gutter: number
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
  const { table, virtualizer, widths, shown, gutter, select } = useGrid(props, scrollRef)
  useFocusAfterEditing(props.edit.editor !== undefined, scrollRef)
  const onScroll = useStepScroll(props.scroll, scrollRef, props.tab.rowCount)
  const hover = usePeekHover(props.links.onPeek)
  const { tab, store } = props
  const totalWidth = gutter + table.getTotalSize()
  return (
    <div
      ref={scrollRef}
      {...gridAttributes(props)}
      onKeyDown={keyHandler(props, select)}
      onScroll={onScroll}
    >
      <Header props={props} table={table} shown={shown} gutter={gutter} />
      <GridRows
        items={virtualizer.getVirtualItems()}
        totalSize={virtualizer.getTotalSize() + HEADER_HEIGHT}
        rowAt={(index) => (index < tab.rowCount ? store.row(index, tab.viewVersion) : undefined)}
        layout={layoutOf(props, { widths, shown, gutter, totalWidth, select })}
        events={eventsOf(props, { select, hover })}
      />
    </div>
  )
}

interface HeaderProps {
  readonly props: GridProps
  readonly table: GridTable
  readonly shown: ColumnWindow
  readonly gutter: number
}

const Header = ({ props, table, shown, gutter }: HeaderProps): ReactElement => (
  <GridHeader
    table={table}
    tab={props.tab}
    shown={shown}
    gutter={gutter}
    isDisabled={props.tab.status === TabStatus.Running}
    onView={props.onView}
    onCopyName={copyName(props)}
    {...props.columns}
  />
)

// The host copies the name of a column to the clipboard.
function copyName({ api, tab }: GridProps): (column: number) => void {
  return (column) => {
    api.postMessage({ type: WebviewMessageType.CopyColumnName, tabId: tab.id, column })
  }
}

function useGrid(props: GridProps, scrollRef: ScrollRef): GridModel {
  const table = useGridTable(props.tab, props.onView)
  const rowCount = gridRowCount(props.tab)
  const virtualizer = useGridVirtualizer(rowCount, scrollRef)
  useRowWindow(props.api, props.fetching, {
    store: props.store,
    items: virtualizer.getVirtualItems(),
  })
  useSyncExternalStore(props.store.subscribe, props.store.revision)
  const widths = table.getFlatHeaders().map((header) => header.getSize())
  const gutter = rowNumberWidth(rowCount)
  const shown = useColumnWindow(widths, scrollRef, gutter)
  const select = (selection: GridSelection): void => {
    props.onSelect(selection)
    virtualizer.scrollToIndex(selection.focus.row)
    scrollRef.current?.scrollTo({
      left: revealedScroll(scrollRef.current, { widths, gutter }, selection.focus.column),
    })
  }
  return { table, virtualizer, widths, shown, gutter, select }
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
    // The row numbers come first.
    'aria-colcount': tab.columns.length + 1,
    'aria-multiselectable': true,
    'aria-readonly': !isEditing(tab),
    'aria-activedescendant':
      selection === undefined
        ? undefined
        : cellId(tab.id, selection.focus.row, selection.focus.column),
    tabIndex: 0,
  }
}

function keyHandler(
  props: GridProps,
  select: (selection: GridSelection) => void,
): (event: KeyboardEvent<HTMLDivElement>) => void {
  return (event) => {
    onGridKey(event, props, { select, pageSize: pageSize(event.currentTarget) })
  }
}
