import type { VirtualItem } from '@tanstack/react-virtual'
import type { MouseEvent, ReactElement } from 'react'

import type { ResultColumn } from '../core/engine/query.ts'
import { type CellPosition, isSelected } from '../core/grid/selection.ts'
import type { CellRange, WireRow } from '../core/results/protocol.ts'
import { CellEditor, type CellEditorActions } from './CellEditor.tsx'
import type { RowEdit } from './edit-overlay.ts'
import { cellDisplay, cellNote, type CellState, rowClassName } from './grid-cells.ts'
import { ariaRowIndex, cellId, HEADER_HEIGHT, ROW_HEIGHT } from './grid-model.ts'
import type { CellEditorView } from './use-cell-editor.ts'

export interface RowLayout {
  readonly tabId: string
  readonly columns: readonly ResultColumn[]
  readonly widths: readonly number[]
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
      {layout.columns.map((column, columnIndex) => (
        <GridCell
          key={column.name + String(columnIndex)}
          cell={{ position: { row: index, column: columnIndex }, kind: column.kind, row, edit }}
          name={column.name}
          layout={layout}
          events={events}
        />
      ))}
    </div>
  )
}

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
      aria-colindex={position.column + 1}
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
