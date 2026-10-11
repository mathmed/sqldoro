import type { VirtualItem } from '@tanstack/react-virtual'
import { useEffect } from 'react'

import { type ResultTab, WebviewMessageType } from '../core/results/protocol.ts'
import type { ResultsApi } from './results-api.ts'
import { type RowView, WINDOW_ROWS } from './row-store.ts'

// Asks the host for the windows of rows the grid is about to show and does not hold yet.
export function useRowWindow(
  api: ResultsApi,
  tab: ResultTab,
  { store, items }: { readonly store: RowView; readonly items: readonly VirtualItem[] },
): void {
  const first = items.at(0)?.index ?? 0
  const last = items.at(-1)?.index ?? -1
  useEffect(() => {
    const starts = store.windowsToFetch({ first, last }, tab.rowCount, tab.viewVersion)
    for (const start of starts) {
      api.postMessage({
        type: WebviewMessageType.FetchRows,
        tabId: tab.id,
        viewVersion: tab.viewVersion,
        start,
        count: WINDOW_ROWS,
      })
    }
  }, [api, store, tab.id, tab.rowCount, tab.viewVersion, first, last])
}
