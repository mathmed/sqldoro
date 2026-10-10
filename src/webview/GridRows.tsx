import type { VirtualItem } from '@tanstack/react-virtual'
import type { MouseEvent, ReactElement } from 'react'

import type { ResultColumn } from '../core/engine/query.ts'
import { type CellPosition, isSelected } from '../core/grid/selection.ts'
import type { CellRange, WireRow } from '../core/results/protocol.ts'
import { CellEditor, type CellEditorActions } from './CellEditor.tsx'
import type { RowEdit } from './edit-overlay.ts'
import { cellDisplay, cellNote, type CellState, rowClassName } from './grid-cells.ts'
import { ariaColumnIndex, ariaRowIndex, cellId, HEADER_HEIGHT, ROW_HEIGHT } from './grid-model.ts'
import type { CellEditorView } from './use-cell-editor.ts'
import type { ColumnWindow } from './use-column-window.ts'

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
  const isInSelection = layout.range !== undefined && isSelected(layout.range, position)
  const isFocus = layout.focus?.row === position.row && layout.focus.column === position.column
  const display = cellDisplay(cell, { isInSelection, isFocus })
  return (
    <div
      id={cellId(layout.tabId, position.row, position.column)}
      className={display.className}
      role="gridcell"
      aria-colindex={ariaColumnIndex(position.column)}
      aria-selected={isInSelection}
      aria-readonly={layout.isEditing ? !layout.canEdit(position) : undefined}
      aria-description={cellNote(cell)}
      style={{ width: layout.widths.at(position.column) }}
      onMouseDown={(event: MouseEvent) => {
        events.onCellDown(position, event.shiftKey)
      }}
      onDoubleClick={() => {
        events.onCellOpen(position)
      }}
    >
      <CellContent cell={cell} text={display.text} name={name} editor={layout.editor} />
    </div>
  )
}

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
