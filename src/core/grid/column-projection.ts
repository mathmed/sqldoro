import type { ColumnFilter } from '../results/conditions.ts'
import type {
  CellBlock,
  EditMessage,
  ResultTab,
  WebviewMessage,
  WireRow,
} from '../results/protocol.ts'
import { WebviewMessageType } from '../results/protocol.ts'
import type { PendingCell, TabEditing } from '../results/tab-editing.ts'
import type { SortKey, ViewSpec } from '../results/view.ts'

// The grid shows some columns of a result, in an order of its own: the columns of the grid are
// positions in `shown`, the list of the result columns it shows. The host only knows the columns of
// the result: what the grid shows is projected, what it sends is put back.
export type Shown = readonly number[]

function displayOf(shown: Shown, column: number): number {
  return shown.indexOf(column)
}

function resultOf(shown: Shown, column: number): number {
  return shown.at(column) ?? column
}

function pick<T>(list: readonly T[], shown: Shown): T[] {
  return shown.flatMap((column) => list.slice(column, column + 1))
}

// A tab as the grid shows it: its columns, what the catalog says of them, its view and the changes
// of its rows, in the columns shown.
export function projectTab(tab: ResultTab, shown: Shown): ResultTab {
  return {
    ...tab,
    columns: pick(tab.columns, shown),
    meta: pick(tab.meta, shown),
    view: projectView(tab.view, shown),
    editing: projectEditing(tab.editing, shown),
  }
}

function projectEditing(editing: TabEditing, shown: Shown): TabEditing {
  return {
    ...editing,
    columns: pick(editing.columns, shown),
    rows: editing.rows.map((row) => ({ ...row, cells: projectCells(row.cells, shown) })),
    newRows: editing.newRows.map((row) => ({ ...row, cells: projectCells(row.cells, shown) })),
  }
}

function projectCells(cells: readonly PendingCell[], shown: Shown): PendingCell[] {
  return cells.flatMap((cell) => {
    const column = displayOf(shown, cell.column)
    return column === -1 ? [] : [{ ...cell, column }]
  })
}

// The sort and the filters of the columns shown; those of the hidden ones still apply, unseen.
export function projectView(view: ViewSpec, shown: Shown): ViewSpec {
  return {
    sort: projectParts(view.sort, shown),
    filters: projectParts(view.filters, shown),
  }
}

function projectParts<T extends { readonly column: number }>(
  parts: readonly T[],
  shown: Shown,
): T[] {
  return parts.flatMap((part) => {
    const column = displayOf(shown, part.column)
    return column === -1 ? [] : [{ ...part, column }]
  })
}

// A view the grid made, in the columns of the result, with the sort and filters of the hidden
// columns of the view it changed.
export function resultView(view: ViewSpec, shown: Shown, previous: ViewSpec): ViewSpec {
  const isHidden = (part: { readonly column: number }): boolean => !shown.includes(part.column)
  return {
    sort: [...unprojectParts<SortKey>(view.sort, shown), ...previous.sort.filter(isHidden)],
    filters: [
      ...unprojectParts<ColumnFilter>(view.filters, shown),
      ...previous.filters.filter(isHidden),
    ],
  }
}

function unprojectParts<T extends { readonly column: number }>(
  parts: readonly T[],
  shown: Shown,
): T[] {
  return parts.map((part) => ({ ...part, column: resultOf(shown, part.column) }))
}

// A row as the grid shows it: the cells of the columns shown, and which of them were cut.
export function projectRow(row: WireRow, shown: Shown): WireRow {
  return {
    cells: shown.map((column) => row.cells.at(column) ?? null),
    truncated: row.truncated.flatMap((column) => {
      const display = displayOf(shown, column)
      return display === -1 ? [] : [display]
    }),
  }
}

// The column of the grid a column of the result shows in; undefined when it is hidden.
export function displayColumn(shown: Shown, column: number): number | undefined {
  const display = displayOf(shown, column)
  return display === -1 ? undefined : display
}

function resultBlock(block: CellBlock, shown: Shown): CellBlock {
  return { ...block, columns: block.columns.map((column) => resultOf(shown, column)) }
}

// A message of the grid, in the columns of the result: what it names by a column of the grid names
// the column of the result shown there. `view` is the view of the tab in the columns of the result.
export function resultMessage(
  message: WebviewMessage,
  shown: Shown,
  view: ViewSpec,
): WebviewMessage {
  switch (message.type) {
    case WebviewMessageType.Copy:
      return { ...message, block: resultBlock(message.block, shown) }
    case WebviewMessageType.Edit:
      return { ...message, edit: resultEdit(message.edit, shown) }
    case WebviewMessageType.SetView:
      return { ...message, view: resultView(message.view, shown, view) }
    default:
      return 'column' in message ? { ...message, column: resultOf(shown, message.column) } : message
  }
}

function resultEdit(edit: EditMessage, shown: Shown): EditMessage {
  return edit.block === null ? edit : { ...edit, block: resultBlock(edit.block, shown) }
}
