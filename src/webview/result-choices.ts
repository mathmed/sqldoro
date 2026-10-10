import { useState } from 'react'

import {
  type CellPosition,
  clampSelection,
  type GridSelection,
  selectionRange,
} from '../core/grid/selection.ts'
import { ExportFormat } from '../core/results/export-format.ts'
import { type ResultTab, WebviewMessageType } from '../core/results/protocol.ts'
import { gridRowCount } from './edit-overlay.ts'
import type { ResultsApi } from './results-api.ts'
import type { ToolbarActions } from './Toolbar.tsx'

// What the user chose in the result: selected cells, the cell shown whole, where to sort and filter.
export interface ResultChoices {
  readonly selection: GridSelection | undefined
  readonly setSelection: (selection: GridSelection) => void
  readonly detail: CellPosition | undefined
  readonly setDetail: (detail: CellPosition | undefined) => void
  readonly isServerSide: boolean
  readonly setIsServerSide: (isServerSide: boolean) => void
}

// The selection stays inside the rows when a view, new rows or rows added in the grid change them.
export function useChoices(tab: ResultTab): ResultChoices {
  const [selection, setSelection] = useState<GridSelection>()
  const [detail, setDetail] = useState<CellPosition>()
  const [isServerSide, setIsServerSide] = useState(tab.isServerView)
  const rowCount = gridRowCount(tab)
  const bounds = { rowCount, columnCount: tab.columns.length, pageSize: 1 }
  const bounded =
    selection === undefined || rowCount === 0 ? undefined : clampSelection(selection, bounds)
  return { selection: bounded, setSelection, detail, setDetail, isServerSide, setIsServerSide }
}

export function toolbarActions(
  api: ResultsApi,
  tab: ResultTab,
  choices: ResultChoices,
): ToolbarActions {
  return {
    ...runActions(api, tab),
    copy: (format: ExportFormat) => {
      copySelection(api, tab, { selection: choices.selection, format, isWholeRows: false })
    },
    copyRows: () => {
      copySelection(api, tab, {
        selection: choices.selection,
        format: ExportFormat.Sql,
        isWholeRows: true,
      })
    },
    export: (format: ExportFormat) => {
      api.postMessage({ type: WebviewMessageType.Export, tabId: tab.id, format })
    },
    setServerSide: choices.setIsServerSide,
  }
}

// What stops the statement of the tab, or runs it again.
function runActions(
  api: ResultsApi,
  tab: ResultTab,
): Pick<ToolbarActions, 'cancel' | 'loadAll' | 'refresh'> {
  return {
    cancel: () => {
      api.postMessage({ type: WebviewMessageType.Cancel })
    },
    loadAll: () => {
      api.postMessage({ type: WebviewMessageType.LoadAll, tabId: tab.id })
    },
    refresh: () => {
      api.postMessage({ type: WebviewMessageType.Refresh, tabId: tab.id })
    },
  }
}

interface CopyRequest {
  readonly selection: GridSelection | undefined
  readonly format: ExportFormat
  // Every column of the selected rows: INSERT statements that write them whole.
  readonly isWholeRows: boolean
}

function copySelection(api: ResultsApi, tab: ResultTab, request: CopyRequest): void {
  if (request.selection !== undefined) {
    const selected = selectionRange(request.selection)
    const range = request.isWholeRows
      ? { ...selected, firstColumn: 0, lastColumn: tab.columns.length - 1 }
      : selected
    const { id: tabId, viewVersion } = tab
    api.postMessage({
      type: WebviewMessageType.Copy,
      tabId,
      viewVersion,
      range,
      format: request.format,
    })
  }
}
