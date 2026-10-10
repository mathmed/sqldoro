import { type ReactElement, useEffect, useReducer, useState } from 'react'

import {
  activateTab,
  activeTab,
  EMPTY_RESULTS,
  reduceResults,
  type ResultsState,
} from '../core/grid/results-state.ts'
import {
  type CellMessage,
  type HostMessage,
  HostMessageType,
  WebviewMessageType,
} from '../core/results/protocol.ts'
import { ConnectionBanner } from './ConnectionBanner.tsx'
import { listenToHost, type VsCodeApi } from './host.ts'
import { ResultView } from './ResultView.tsx'
import { RowStores } from './row-stores.ts'
import { TabBar } from './TabBar.tsx'

type Action =
  | { readonly kind: 'host'; readonly message: HostMessage }
  | { readonly kind: 'activate'; readonly tabId: string }

function reduce(state: ResultsState, action: Action): ResultsState {
  return action.kind === 'host'
    ? reduceResults(state, action.message)
    : activateTab(state, action.tabId)
}

interface Results {
  readonly state: ResultsState
  readonly stores: RowStores
  readonly cell: CellMessage | undefined
  readonly activate: (tabId: string) => void
}

// Listens to the extension host (then tells it the view is ready): rows and cell values go to the
// row stores and the cell detail; the rest changes the tabs.
function useResults(api: VsCodeApi): Results {
  const [state, dispatch] = useReducer(reduce, EMPTY_RESULTS)
  const [stores] = useState(() => new RowStores())
  const [cell, setCell] = useState<CellMessage>()
  useEffect(
    () =>
      listenToHost(api, (message) => {
        route(message, { stores, setCell, dispatch })
      }),
    [api, stores],
  )
  useEffect(() => {
    api.postMessage({ type: WebviewMessageType.Ready })
  }, [api])
  useEffect(() => {
    stores.retain(new Set(state.tabs.map((tab) => tab.id)))
  }, [state.tabs, stores])
  return {
    state,
    stores,
    cell,
    activate: (tabId) => {
      dispatch({ kind: 'activate', tabId })
    },
  }
}

interface Routes {
  readonly stores: RowStores
  readonly setCell: (cell: CellMessage) => void
  readonly dispatch: (action: Action) => void
}

function route(message: HostMessage, { stores, setCell, dispatch }: Routes): void {
  if (message.type === HostMessageType.Rows) {
    stores.of(message.tabId).store(message.viewVersion, message.start, message.rows)
    return
  }
  if (message.type === HostMessageType.Cell) {
    setCell(message)
    return
  }
  dispatch({ kind: 'host', message })
}

// The result view: the tabs of the last run and the result of the one in front.
export const App = ({ api }: { readonly api: VsCodeApi }): ReactElement => {
  const { state, stores, cell, activate } = useResults(api)
  const tab = activeTab(state)
  return (
    <main className="results">
      {state.connection === null ? null : <ConnectionBanner connection={state.connection} />}
      <TabBar tabs={state.tabs} activeTabId={state.activeTabId} onActivate={activate} />
      {tab === undefined ? (
        <p className="empty-state">Run a query to see its results here.</p>
      ) : (
        <ResultView
          key={tab.id}
          tab={tab}
          store={stores.of(tab.id)}
          api={api}
          cell={cell}
          connection={state.connection}
        />
      )}
    </main>
  )
}
