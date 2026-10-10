import type { VirtualItem } from '@tanstack/react-virtual'
import type { MouseEvent, ReactElement } from 'react'

import type { ColumnKind, ResultColumn } from '../core/engine/query.ts'
import { type CellPosition, isSelected } from '../core/grid/selection.ts'
import type { CellRange, WireRow } from '../core/results/protocol.ts'
import { displayCell } from './cell-display.ts'
import { ariaRowIndex, cellId, HEADER_HEIGHT, ROW_HEIGHT } from './grid-model.ts'

export interface RowLayout {
  readonly tabId: string
  readonly columns: readonly ResultColumn[]
  readonly widths: readonly number[]
  readonly totalWidth: number
  readonly range: CellRange | undefined
  readonly focus: CellPosition | undefined
}

export interface CellEvents {
  readonly onCellDown: (position: CellPosition, isExtending: boolean) => void
  readonly onCellOpen: (position: CellPosition) => void
}

interface GridRowsProps {
  readonly items: readonly VirtualItem[]
  readonly totalSize: number
  readonly rowAt: (index: number) => WireRow | undefined
  readonly layout: RowLayout
  readonly events: CellEvents
}

// Only the rows in view (and a few around) exist in the page; each sits at its own offset.
export const GridRows = ({
  items,
  totalSize,
  rowAt,
  layout,
  events,
}: GridRowsProps): ReactElement => (
  <div
    className="grid-body"
    role="rowgroup"
    style={{ height: totalSize - HEADER_HEIGHT, width: layout.totalWidth }}
  >
    {items.map((item) => (
      <GridRow
        key={item.key}
        index={item.index}
        offset={item.start - HEADER_HEIGHT}
        row={rowAt(item.index)}
        layout={layout}
        events={events}
      />
    ))}
  </div>
)

interface GridRowProps {
  readonly index: number
  readonly offset: number
  readonly row: WireRow | undefined
  readonly layout: RowLayout
  readonly events: CellEvents
}

const GridRow = ({ index, offset, row, layout, events }: GridRowProps): ReactElement => (
  <div
    className={row === undefined ? 'grid-row loading' : 'grid-row'}
    role="row"
    aria-rowindex={ariaRowIndex(index)}
    style={{
      transform: `translateY(${String(offset)}px)`,
      height: ROW_HEIGHT,
      width: layout.totalWidth,
    }}
  >
    {layout.columns.map((column, columnIndex) => (
      <GridCell
        key={column.name + String(columnIndex)}
        position={{ row: index, column: columnIndex }}
        kind={column.kind}
        row={row}
        layout={layout}
        events={events}
      />
    ))}
  </div>
)

interface GridCellProps {
  readonly position: CellPosition
  readonly kind: ColumnKind
  readonly row: WireRow | undefined
  readonly layout: RowLayout
  readonly events: CellEvents
}

interface CellLook {
  readonly className: string
  readonly text: string
  readonly isSelected: boolean
}

type CellState = Omit<GridCellProps, 'events'>

const LOADING = { text: '', look: 'loading' }

// How a cell looks: its value (NULL apart from empty, a mark when it was cut), the selection and
// the focus.
function cellLook(cell: CellState): CellLook {
  const isInSelection = isCellSelected(cell)
  const display = displayOf(cell)
  return {
    className: classNameOf(display.look, isInSelection, isFocus(cell)),
    text: display.text,
    isSelected: isInSelection,
  }
}

function isCellSelected({ position, layout }: CellState): boolean {
  return layout.range !== undefined && isSelected(layout.range, position)
}

function isFocus({ position, layout }: CellState): boolean {
  return layout.focus?.row === position.row && layout.focus.column === position.column
}

function displayOf({ position, kind, row }: CellState): {
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

function classNameOf(look: string, isInSelection: boolean, isFocused: boolean): string {
  return [
    'grid-cell',
    `look-${look}`,
    isInSelection ? 'selected' : '',
    isFocused ? 'focused' : '',
  ].join(' ')
}

const GridCell = ({ position, kind, row, layout, events }: GridCellProps): ReactElement => {
  const look = cellLook({ position, kind, row, layout })
  return (
    <div
      id={cellId(layout.tabId, position.row, position.column)}
      className={look.className}
      role="gridcell"
      aria-colindex={position.column + 1}
      aria-selected={look.isSelected}
      style={{ width: layout.widths.at(position.column) }}
      onMouseDown={(event: MouseEvent) => {
        events.onCellDown(position, event.shiftKey)
      }}
      onDoubleClick={() => {
        events.onCellOpen(position)
      }}
    >
      {look.text}
    </div>
  )
}
