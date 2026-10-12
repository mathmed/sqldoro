import type { VirtualItem } from '@tanstack/react-virtual'
import { useEffect } from 'react'

import { type ResultTab, WebviewMessageType } from '../core/results/protocol.ts'
import type { ResultsApi } from './results-api.ts'
import { type RowView, WINDOW_ROWS } from './row-store.ts'

// The grid asks for the rows this far past those it shows, both ways, so that scrolling finds them
// here already.
const FETCH_AHEAD_ROWS = 100

export interface RowRange {
  readonly first: number
  readonly last: number
}

// Asks the host for the windows of rows the grid is about to show and does not hold yet.
export function useRowWindow(
  api: ResultsApi,
  tab: ResultTab,
  { store, items }: { readonly store: RowView; readonly items: readonly VirtualItem[] },
): void {
  const first = items.at(0)?.index ?? 0
  const last = items.at(-1)?.index ?? -1
  const { id, rowCount, viewVersion } = tab
  useEffect(() => {
    requestRows(api, { id, rowCount, viewVersion }, { store, range: { first, last } })
  }, [api, store, id, rowCount, viewVersion, first, last])
}

// Asks for the windows of rows of a range (and around it) the store does not hold or wait for.
export function requestRows(
  api: ResultsApi,
  tab: Pick<ResultTab, 'id' | 'rowCount' | 'viewVersion'>,
  { store, range }: { readonly store: RowView; readonly range: RowRange },
): void {
  const around = {
    first: Math.max(range.first - FETCH_AHEAD_ROWS, 0),
    last: range.last + FETCH_AHEAD_ROWS,
  }
  for (const start of store.windowsToFetch(around, tab.rowCount, tab.viewVersion)) {
    api.postMessage({
      type: WebviewMessageType.FetchRows,
      tabId: tab.id,
      viewVersion: tab.viewVersion,
      start,
      count: WINDOW_ROWS,
    })
  }
}
