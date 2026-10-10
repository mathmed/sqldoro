import { type ReactElement, useState } from 'react'

import type { CellValue } from '../core/engine/query.ts'
import {
  type CellPosition,
  clampSelection,
  type GridSelection,
  selectionRange,
} from '../core/grid/selection.ts'
import type { ExportFormat } from '../core/results/export-format.ts'
import {
  type CellMessage,
  type ResultTab,
  TabKind,
  TabStatus,
  WebviewMessageType,
} from '../core/results/protocol.ts'
import type { ViewSpec } from '../core/results/view.ts'
import { CellDetail } from './CellDetail.tsx'
import { Grid } from './Grid.tsx'
import type { VsCodeApi } from './host.ts'
import { PlanView } from './PlanView.tsx'
import type { RowStore } from './row-store.ts'
import { StatusLine } from './StatusLine.tsx'
import { Toolbar, type ToolbarActions } from './Toolbar.tsx'

interface ResultViewProps {
  readonly tab: ResultTab
  readonly store: RowStore
  readonly api: VsCodeApi
  readonly cell: CellMessage | undefined
}

// What the user chose in the result: selected cells, the cell shown whole, where to sort and filter.
interface ResultChoices {
  readonly selection: GridSelection | undefined
  readonly setSelection: (selection: GridSelection) => void
  readonly detail: CellPosition | undefined
  readonly setDetail: (detail: CellPosition | undefined) => void
  readonly isServerSide: boolean
  readonly setIsServerSide: (isServerSide: boolean) => void
}

// The result of one statement: its actions, what happened, and its rows or plan.
export const ResultView = ({ tab, store, api, cell }: ResultViewProps): ReactElement => {
  const choices = useChoices(tab)
  const actions = toolbarActions(api, tab, choices)
  return (
    <section
      role="tabpanel"
      id="result-panel"
      aria-labelledby={`tab-${tab.id}`}
      className="result-view"
    >
      <Toolbar
        tab={tab}
        hasSelection={choices.selection !== undefined}
        isServerSide={choices.isServerSide}
        actions={actions}
      />
      <StatusLine tab={tab} />
      <div className="result-body">
        <ResultContent tab={tab} store={store} api={api} choices={choices} onCopy={actions.copy} />
        <DetailPanel tab={tab} store={store} cell={cell} choices={choices} />
      </div>
    </section>
  )
}

// The selection stays inside the rows when a view or new rows change them.
function useChoices(tab: ResultTab): ResultChoices {
  const [selection, setSelection] = useState<GridSelection>()
  const [detail, setDetail] = useState<CellPosition>()
  const [isServerSide, setIsServerSide] = useState(tab.isServerView)
  const bounds = { rowCount: tab.rowCount, columnCount: tab.columns.length, pageSize: 1 }
  const bounded =
    selection === undefined || tab.rowCount === 0 ? undefined : clampSelection(selection, bounds)
  return { selection: bounded, setSelection, detail, setDetail, isServerSide, setIsServerSide }
}

function toolbarActions(api: VsCodeApi, tab: ResultTab, choices: ResultChoices): ToolbarActions {
  return {
    cancel: () => {
      api.postMessage({ type: WebviewMessageType.Cancel })
    },
    loadAll: () => {
      api.postMessage({ type: WebviewMessageType.LoadAll, tabId: tab.id })
    },
    copy: (format: ExportFormat) => {
      copySelection(api, tab, { selection: choices.selection, format })
    },
    export: (format: ExportFormat) => {
      api.postMessage({ type: WebviewMessageType.Export, tabId: tab.id, format })
    },
    setServerSide: choices.setIsServerSide,
  }
}

interface CopyRequest {
  readonly selection: GridSelection | undefined
  readonly format: ExportFormat
}

function copySelection(api: VsCodeApi, tab: ResultTab, { selection, format }: CopyRequest): void {
  if (selection !== undefined) {
    const range = selectionRange(selection)
    const { id: tabId, viewVersion } = tab
    api.postMessage({ type: WebviewMessageType.Copy, tabId, viewVersion, range, format })
  }
}

interface ResultContentProps {
  readonly tab: ResultTab
  readonly store: RowStore
  readonly api: VsCodeApi
  readonly choices: ResultChoices
  readonly onCopy: (format: ExportFormat) => void
}

const ResultContent = ({
  tab,
  store,
  api,
  choices,
  onCopy,
}: ResultContentProps): ReactElement | null => {
  if (tab.kind === TabKind.Plan) {
    return <PlanView lines={tab.plan} />
  }
  return tab.columns.length === 0 ? null : (
    <Grid
      api={api}
      tab={tab}
      store={store}
      selection={choices.selection}
      onSelect={choices.setSelection}
      onOpenDetail={(position) => {
        choices.setDetail(position)
        requestCell(api, tab, { store, position })
      }}
      onView={(view) => {
        changeView(api, tab, { view, isServerSide: choices.isServerSide })
      }}
      onCopy={onCopy}
    />
  )
}

interface ViewChange {
  readonly view: ViewSpec
  readonly isServerSide: boolean
}

// While the statement runs, the rows are still coming: the view waits for the end.
function changeView(api: VsCodeApi, tab: ResultTab, change: ViewChange): void {
  if (tab.status !== TabStatus.Running) {
    api.postMessage({ type: WebviewMessageType.SetView, tabId: tab.id, ...change })
  }
}

interface CellPlace {
  readonly store: RowStore
  readonly position: CellPosition
}

// What the grid holds of a cell, unless it was cut (or is not here): then only the host has it.
function heldValue({ store, position }: CellPlace): CellValue | undefined {
  const row = store.row(position.row)
  return row === undefined || row.truncated.includes(position.column)
    ? undefined
    : row.cells.at(position.column)
}

function requestCell(api: VsCodeApi, tab: ResultTab, place: CellPlace): void {
  if (heldValue(place) === undefined) {
    const { id: tabId, viewVersion } = tab
    api.postMessage({ type: WebviewMessageType.FetchCell, tabId, viewVersion, ...place.position })
  }
}

interface DetailPanelProps {
  readonly tab: ResultTab
  readonly store: RowStore
  readonly cell: CellMessage | undefined
  readonly choices: ResultChoices
}

const DetailPanel = ({ tab, store, cell, choices }: DetailPanelProps): ReactElement | null => {
  const position = choices.detail
  const column = position === undefined ? undefined : tab.columns.at(position.column)
  if (position === undefined || column === undefined) {
    return null
  }
  return (
    <CellDetail
      column={column}
      value={detailValue({ store, position }, cell, tab)}
      onClose={() => {
        choices.setDetail(undefined)
      }}
    />
  )
}

// The value held here, else the one the host sent for this cell, else nothing yet.
function detailValue(
  place: CellPlace,
  cell: CellMessage | undefined,
  tab: ResultTab,
): CellValue | undefined {
  const held = heldValue(place)
  if (held !== undefined || cell === undefined) {
    return held
  }
  return isAnswer(cell, tab, place.position) ? cell.value : undefined
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
