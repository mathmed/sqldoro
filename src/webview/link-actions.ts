import type { CellPosition } from '../core/grid/selection.ts'
import type { NavigationStart } from '../core/results/protocol-parts.ts'
import { type ResultTab, WebviewMessageType } from '../core/results/protocol.ts'
import type { ResultsApi } from './results-api.ts'

// What the links of a result do: open the row a foreign key points at (in place in a table panel, as
// a link of a browser does, or in a new tab), peek at it, count and open the rows that reference a
// row.
export interface LinkActions {
  // Whether the cell points at a row: its column is in a foreign key, and it is not NULL.
  readonly isLink: (position: CellPosition, value: unknown) => boolean
  readonly open: (position: CellPosition, isInPlace: boolean) => void
  readonly peek: (position: CellPosition) => void
  readonly countReferences: (row: number) => void
  readonly openReference: (row: number, reference: number, isInPlace: boolean) => void
  // Only a table panel keeps a trail to come back along: elsewhere everything opens a panel, and
  // asking for in place opens one too.
  readonly canOpenInPlace: boolean
}

// Where a navigation from a row of the tab starts; in place only in a table panel (its rows, or the
// result of a query of its query box).
function startOf(tab: ResultTab, row: number, isInPlace: boolean): NavigationStart {
  return {
    tabId: tab.id,
    viewVersion: tab.viewVersion,
    row,
    isInPlace: isInPlace && isTablePanel(tab),
  }
}

function isTablePanel(tab: ResultTab): boolean {
  return tab.queryBox !== null
}

export function linkActions(api: ResultsApi, tab: ResultTab): LinkActions {
  const { id: tabId, viewVersion } = tab
  return {
    isLink: (position, value) =>
      value !== null &&
      value !== undefined &&
      (tab.meta.at(position.column)?.reference ?? '') !== '',
    open: ({ row, column }, isInPlace) => {
      api.postMessage({
        type: WebviewMessageType.Navigate,
        ...startOf(tab, row, isInPlace),
        column,
      })
    },
    peek: ({ row, column }) => {
      api.postMessage({ type: WebviewMessageType.Peek, tabId, viewVersion, row, column })
    },
    countReferences: (row) => {
      api.postMessage({ type: WebviewMessageType.CountReferences, tabId, viewVersion, row })
    },
    openReference: (row, reference, isInPlace) => {
      api.postMessage({
        type: WebviewMessageType.OpenReference,
        ...startOf(tab, row, isInPlace),
        reference,
      })
    },
    canOpenInPlace: isTablePanel(tab),
  }
}
