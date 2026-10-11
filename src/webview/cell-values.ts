import type { CellValue } from '../core/engine/query.ts'
import type { CellPosition } from '../core/grid/selection.ts'
import { type CellMessage, type ResultTab, WebviewMessageType } from '../core/results/protocol.ts'
import type { ResultsApi } from './results-api.ts'
import type { RowView } from './row-store.ts'

export interface CellPlace {
  readonly store: RowView
  readonly position: CellPosition
}

// What the grid holds of a cell, unless it was cut (or is not here): then only the host has it.
function heldValue({ store, position }: CellPlace, viewVersion: number): CellValue | undefined {
  const row = store.row(position.row, viewVersion)
  return row === undefined || row.truncated.includes(position.column)
    ? undefined
    : row.cells.at(position.column)
}

export function requestCell(api: ResultsApi, tab: ResultTab, place: CellPlace): void {
  if (heldValue(place, tab.viewVersion) === undefined) {
    const { id: tabId, viewVersion } = tab
    api.postMessage({ type: WebviewMessageType.FetchCell, tabId, viewVersion, ...place.position })
  }
}

// The value the host sent is for this cell of this view.
function isAnswer(cell: CellMessage, tab: ResultTab, position: CellPosition): boolean {
  return (
    cell.tabId === tab.id &&
    cell.viewVersion === tab.viewVersion &&
    cell.row === position.row &&
    cell.column === position.column
  )
}

// The value held here, else the one the host sent for this cell, else nothing yet.
export function wholeValue(
  place: CellPlace,
  { cell, tab }: { readonly cell: CellMessage | undefined; readonly tab: ResultTab },
): CellValue | undefined {
  const held = heldValue(place, tab.viewVersion)
  if (held !== undefined || cell === undefined) {
    return held
  }
  return isAnswer(cell, tab, place.position) ? cell.value : undefined
}
