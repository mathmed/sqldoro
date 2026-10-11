import type { VirtualItem } from '@tanstack/react-virtual'
import type { MouseEvent, ReactElement } from 'react'

import type { ResultColumn } from '../core/engine/query.ts'
import { type CellPosition, type CellRange, isSelected } from '../core/grid/selection.ts'
import type { WireRow } from '../core/results/protocol.ts'
import { CellEditor } from './CellEditor.tsx'
import type { RowEdit } from './edit-overlay.ts'
import type { CellEditorActions } from './editor-keys.ts'
import { cellDisplay, cellNote, type CellState, rowClassName } from './grid-cells.ts'
import { ariaColumnIndex, ariaRowIndex, cellId, HEADER_HEIGHT, ROW_HEIGHT } from './grid-model.ts'
import { Icon, IconName } from './icons.tsx'
import { placeAt } from './overlays.ts'
import type { PopupPlace } from './popup.ts'
import type { CellEditorView } from './use-cell-editor.ts'
import type { ColumnWindow } from './use-column-window.ts'
import type { PeekHover } from './use-peek-hover.ts'

export interface RowLayout {
  readonly tabId: string
  readonly columns: readonly ResultColumn[]
  readonly widths: readonly number[]
  // The width of the row numbers, on the left.
  readonly gutter: number
  // Rows of the view; the rows past them were added in the grid.
  readonly rowCount: number
  // The columns in the page; the others are empty space.
  readonly shown: ColumnWindow
  readonly totalWidth: number
  readonly range: CellRange | undefined
  readonly focus: CellPosition | undefined
  // While the rows can be edited: the changes of a row, and whether a cell takes values.
  readonly isEditing: boolean
  readonly rowEdit: (index: number) => RowEdit | undefined
  readonly canEdit: (position: CellPosition) => boolean
  readonly editor: ShownEditor | undefined
  // Whether a cell points at a row (a foreign key that is not NULL), and whether it opens in place.
  readonly isLink: (position: CellPosition, value: unknown) => boolean
  readonly canOpenInPlace: boolean
}

// The editor of the cell being edited, and what its keys do in the grid.
export interface ShownEditor {
  readonly view: CellEditorView
  readonly actions: CellEditorActions
}

export interface CellEvents {
  readonly onCellDown: (position: CellPosition, isExtending: boolean) => void
  readonly onCellOpen: (position: CellPosition) => void
  // A click on the number of a row: Shift extends the selection to it.
  readonly onRowDown: (row: number, isExtending: boolean) => void
  // A link opens the row it points at, in a panel of its own or in place.
  readonly onLinkOpen: (position: CellPosition, isInPlace: boolean) => void
  readonly onCellMenu: (position: CellPosition, place: PopupPlace) => void
  readonly onLinkHover: PeekHover
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

const GridRow = ({ index, offset, row, layout, events }: GridRowProps): ReactElement => {
  const edit = layout.rowEdit(index)
  return (
    <div
      className={rowClassName(row, edit)}
      role="row"
      aria-rowindex={ariaRowIndex(index)}
      title={edit === undefined || edit.problem === '' ? undefined : edit.problem}
      style={{
        transform: `translateY(${String(offset)}px)`,
        height: ROW_HEIGHT,
        width: layout.totalWidth,
      }}
    >
      <RowNumber index={index} layout={layout} onDown={events.onRowDown} />
      <ColumnSpacer width={layout.shown.before} />
      <RowCells index={index} row={row} edit={edit} layout={layout} events={events} />
    </div>
  )
}

interface RowCellsProps extends Omit<GridRowProps, 'offset'> {
  readonly edit: RowEdit | undefined
}

// The cells of the columns in the page.
const RowCells = ({ index, row, edit, layout, events }: RowCellsProps): ReactElement => (
  <>
    {layout.columns.slice(layout.shown.first, layout.shown.last + 1).map((column, shift) => {
      const columnIndex = layout.shown.first + shift
      return (
        <GridCell
          key={column.name + String(columnIndex)}
          cell={{ position: { row: index, column: columnIndex }, kind: column.kind, row, edit }}
          name={column.name}
          layout={layout}
          events={events}
        />
      )
    })}
  </>
)

interface RowNumberProps {
  readonly index: number
  readonly layout: RowLayout
  readonly onDown: (row: number, isExtending: boolean) => void
}

// The number of a row, muted and always in view on the left; a click selects the row. A row added
// in the grid has no number yet.
const RowNumber = ({ index, layout, onDown }: RowNumberProps): ReactElement => {
  const isInSelection =
    layout.range !== undefined && index >= layout.range.firstRow && index <= layout.range.lastRow
  return (
    <div
      className={isInSelection ? 'row-number selected' : 'row-number'}
      role="rowheader"
      aria-colindex={1}
      style={{ width: layout.gutter }}
      onMouseDown={(event: MouseEvent) => {
        onDown(index, event.shiftKey)
      }}
    >
      {index < layout.rowCount ? String(index + 1) : '+'}
    </div>
  )
}

// Stands for the columns before those in the page, so that these sit where they belong.
export const ColumnSpacer = ({ width }: { readonly width: number }): ReactElement | null =>
  width === 0 ? null : <div className="grid-spacer" aria-hidden="true" style={{ width }} />

interface GridCellProps {
  readonly cell: CellState
  // The name of its column.
  readonly name: string
  readonly layout: RowLayout
  readonly events: CellEvents
}

const GridCell = ({ cell, name, layout, events }: GridCellProps): ReactElement => {
  const { position } = cell
  const marks = marksOf(position, layout)
  const display = cellDisplay(cell, marks)
  const isLink = layout.isLink(position, cell.row?.cells.at(position.column))
  return (
    <div
      id={cellId(layout.tabId, position.row, position.column)}
      className={[display.className, ...(isLink ? ['is-link'] : [])].join(' ')}
      role="gridcell"
      aria-colindex={ariaColumnIndex(position.column)}
      aria-selected={marks.isInSelection}
      aria-readonly={layout.isEditing ? !layout.canEdit(position) : undefined}
      aria-description={cellNote(cell)}
      style={{ width: layout.widths.at(position.column) }}
      {...cellHandlers(position, { isLink, layout, events })}
    >
      <CellContent cell={cell} text={display.text} name={name} editor={layout.editor} />
      {isLink ? <LinkArrow position={position} events={events} /> : null}
    </div>
  )
}

function marksOf(
  position: CellPosition,
  layout: RowLayout,
): { readonly isInSelection: boolean; readonly isFocus: boolean } {
  return {
    isInSelection: layout.range !== undefined && isSelected(layout.range, position),
    isFocus: layout.focus?.row === position.row && layout.focus.column === position.column,
  }
}

interface CellSituation {
  readonly isLink: boolean
  readonly layout: RowLayout
  readonly events: CellEvents
}

// A press selects the cell; on a link, Ctrl (or Cmd) with a click opens the row it points at, and Alt
// with a click opens it in place where the panel keeps a trail.
function cellHandlers(
  position: CellPosition,
  { isLink, layout, events }: CellSituation,
): Record<string, (event: MouseEvent) => void> {
  return {
    onMouseDown: (event) => {
      events.onCellDown(position, event.shiftKey)
    },
    onClick: (event) => {
      if (isLink) {
        openOnModifiedClick(event, position, { layout, events })
      }
    },
    onDoubleClick: () => {
      events.onCellOpen(position)
    },
    onContextMenu: (event) => {
      event.preventDefault()
      events.onCellMenu(position, placeAt(event))
    },
  }
}

function openOnModifiedClick(
  event: MouseEvent,
  position: CellPosition,
  { layout, events }: Omit<CellSituation, 'isLink'>,
): void {
  const isInPlace = event.altKey && layout.canOpenInPlace
  if (event.ctrlKey || event.metaKey || isInPlace) {
    event.preventDefault()
    events.onLinkOpen(position, isInPlace)
  }
}

// The arrow of a link: a click opens the row it points at, the pointer resting on it peeks at it.
const LinkArrow = ({
  position,
  events,
}: {
  readonly position: CellPosition
  readonly events: CellEvents
}): ReactElement => (
  <button
    type="button"
    className="link-arrow"
    tabIndex={-1}
    aria-label="Open the referenced row"
    title="Open the referenced row (Ctrl+click, or Ctrl+Enter); Alt+Enter peeks at it"
    onMouseDown={(event) => {
      event.stopPropagation()
    }}
    onClick={(event) => {
      event.stopPropagation()
      events.onLinkOpen(position, false)
    }}
    onMouseEnter={(event) => {
      events.onLinkHover.enter(position, event.currentTarget)
    }}
    onMouseLeave={events.onLinkHover.leave}
  >
    <Icon name={IconName.ArrowLink} />
  </button>
)

interface CellContentProps {
  readonly cell: CellState
  readonly text: string
  readonly name: string
  readonly editor: ShownEditor | undefined
}

// The value of the cell, or the editor of the cell being edited.
const CellContent = ({ cell, text, name, editor }: CellContentProps): ReactElement => {
  if (editor === undefined || !isSameCell(editor.view.position, cell.position)) {
    return <>{text}</>
  }
  return <CellEditor editor={editor.view} label={`New value of ${name}`} actions={editor.actions} />
}

function isSameCell(left: CellPosition, right: CellPosition): boolean {
  return left.row === right.row && left.column === right.column
}
