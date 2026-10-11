import type { CellPosition, GridSelection } from '../core/grid/selection.ts'
import type { ExportFormat } from '../core/results/export-format.ts'
import type { DistinctMessage, ResultTab } from '../core/results/protocol.ts'
import type { ViewSpec } from '../core/results/view.ts'
import type { LinkActions } from './link-actions.ts'
import type { PopupPlace } from './popup.ts'
import type { ResultsApi } from './results-api.ts'
import type { RowView } from './row-store.ts'
import type { OpenEditor } from './use-cell-editor.ts'
import type { GridScroll } from './use-step-scroll.ts'

// What the grid does with the changes of its rows.
export interface GridEdit {
  readonly editor: OpenEditor | undefined
  readonly start: (position: CellPosition, typed: string | undefined) => void
  readonly deleteRows: () => void
  readonly preview: () => void
}

// What the cells of links do, and the menu of a cell.
export interface GridLinks {
  readonly actions: LinkActions
  readonly onPeek: (position: CellPosition, place: PopupPlace) => void
  readonly onCellMenu: (position: CellPosition, place: PopupPlace) => void
}

// What the headers do beside the view: hide a column, list the values of one for its filter.
export interface GridColumns {
  readonly onHide: (column: number) => void
  readonly onFetchDistinct: (column: number) => void
  readonly distinct: DistinctMessage | undefined
}

export interface GridProps {
  readonly api: ResultsApi
  readonly tab: ResultTab
  readonly store: RowView
  // The tab whose rows the grid asks for: a new view of its tab while it still shows the one before.
  readonly fetching: ResultTab
  readonly selection: GridSelection | undefined
  readonly onSelect: (selection: GridSelection) => void
  readonly onOpenDetail: (position: CellPosition) => void
  readonly onView: (view: ViewSpec) => void
  readonly onCopy: (format: ExportFormat) => void
  readonly edit: GridEdit
  readonly links: GridLinks
  readonly columns: GridColumns
  readonly scroll: GridScroll
}
