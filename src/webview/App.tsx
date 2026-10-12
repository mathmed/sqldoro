import { type ReactElement, useEffect, useReducer, useRef, useState } from 'react'

import {
  activateTab,
  EMPTY_RESULTS,
  reduceResults,
  type ResultsState,
} from '../core/grid/results-state.ts'
import {
  type HostMessage,
  HostMessageType,
  type ResultTab,
  WebviewMessageType,
} from '../core/results/protocol.ts'
import { type HostAnswers, NO_ANSWERS, withAnswer } from './host-answers.ts'
import { listenToHost } from './host.ts'
import { PanelHeader } from './PanelHeader.tsx'
import { QueryBox } from './QueryBox.tsx'
import { RESULTS_CHANNEL, type ResultsApi } from './results-api.ts'
import { ResultView } from './ResultView.tsx'
import { RowStores } from './row-stores.ts'
import { TabBar } from './TabBar.tsx'
import { type QueryBoxView, useQueryBox } from './use-query-box.ts'
import { useShownTab } from './use-shown-tab.ts'
import { useTrailKeys } from './use-trail-keys.ts'
import type { ViewContext } from './view-context.ts'
import { WaitIndicator } from './wait-indicator.ts'
import { boxSql } from './where-source.ts'

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
  // Where the grid of each step of a trail was scrolled to.
  readonly scrolls: Map<number, number>
  readonly answers: HostAnswers
  readonly activate: (tabId: string) => void
  // Whether the panel shows that it waits, through the changes of tab.
  readonly indicator: WaitIndicator
}

// Listens to the extension host (then tells it the view is ready): rows go to the row stores, the
// answers to what the view asked (a whole cell, a peek, counts, the values of a column) to where they
// are shown; the rest changes the tabs.
function useResults(api: ResultsApi): Results {
  const [state, dispatch] = useReducer(reduce, EMPTY_RESULTS)
  const [stores] = useState(() => new RowStores())
  const [scrolls] = useState(() => new Map<number, number>())
  const [answers, setAnswers] = useState<HostAnswers>(NO_ANSWERS)
  const indicator = usePanelIndicator()
  useHostMessages(api, (message) => {
    if (message.type === HostMessageType.Rows) {
      stores.of(message.tabId).store(message.viewVersion, message.start, message.rows)
      return
    }
    setAnswers((current) => withAnswer(current, message))
    dispatch({ kind: 'host', message })
  })
  return {
    state,
    stores,
    scrolls,
    answers,
    indicator,
    activate: (tabId) => {
      dispatch({ kind: 'activate', tabId })
    },
  }
}

// One indicator for the panel, stopped with it.
function usePanelIndicator(): WaitIndicator {
  const [indicator] = useState(() => new WaitIndicator())
  useEffect(
    () => () => {
      indicator.stop()
    },
    [indicator],
  )
  return indicator
}

// Hands each message of the host to `onMessage`, then tells the host the view is ready.
function useHostMessages(api: ResultsApi, onMessage: (message: HostMessage) => void): void {
  const handlerRef = useRef(onMessage)
  useEffect(() => {
    handlerRef.current = onMessage
  })
  useEffect(
    () =>
      listenToHost(api, RESULTS_CHANNEL, (message) => {
        handlerRef.current(message)
      }),
    [api],
  )
  useEffect(() => {
    api.postMessage({ type: WebviewMessageType.Ready })
  }, [api])
}

// The result view: the trail of a table panel and its connection, the tabs of the last run (when it
// has several), the query box of a table panel, and the result of the one in front; while a new one
// is on its way, the result of before stays.
export const App = ({ api }: { readonly api: ResultsApi }): ReactElement => {
  const { state, stores, scrolls, answers, activate, indicator } = useResults(api)
  useTrailKeys(api, state.crumbs)
  const { tab, incoming } = useShownTab(state, { api, stores, scrolls })
  const box = useQueryBox(api, { tab, incoming, state })
  const hasTabs = state.tabs.length > 1
  return (
    <main className="results">
      <PanelHeader api={api} connection={state.connection} crumbs={state.crumbs} />
      {hasTabs ? (
        <TabBar tabs={state.tabs} activeTabId={state.activeTabId} onActivate={activate} />
      ) : null}
      <ShownQueryBox box={box} state={state} tab={tab} />
      {tab === undefined ? (
        <NoResult hasHeardTabs={state.hasHeardTabs} />
      ) : (
        <ResultView
          key={tab.id}
          tab={tab}
          incoming={incoming}
          store={stores.of(tab.id)}
          api={api}
          answers={answers}
          context={viewContext(state, { scrolls, indicator, queryMode: modeOf(box) })}
          hasTabs={hasTabs}
        />
      )}
    </main>
  )
}

// Above the result of a table panel, in place of the WHERE of its table, when it is shown.
const ShownQueryBox = ({
  box,
  state,
  tab,
}: {
  readonly box: QueryBoxView
  readonly state: ResultsState
  readonly tab: ResultTab | undefined
}): ReactElement | null =>
  box.isShown && tab !== undefined ? (
    <QueryBox
      view={box}
      sql={boxSql(tab, { sql: state.sql, tables: state.queryBox.tables })}
      tab={tab}
    />
  ) : null

function modeOf(box: QueryBoxView): ViewContext['queryMode'] {
  return { isOn: box.isShown, toggle: box.toggle }
}

// Before the host tells the tabs (the view is loading), nothing: the panel does not flash a text.
const NoResult = ({ hasHeardTabs }: { readonly hasHeardTabs: boolean }): ReactElement | null =>
  hasHeardTabs ? <p className="empty-state">Run a query to see its results here.</p> : null

// What the result of a tab shows of the panel: its connection, how its SQL is written, and the step
// of the trail it is (its scroll position is kept for it).
function viewContext(
  state: ResultsState,
  panel: Pick<ViewContext, 'indicator' | 'queryMode' | 'scrolls'>,
): ViewContext {
  return {
    connection: state.connection,
    sql: state.sql,
    step: state.crumbs.find((crumb) => crumb.isCurrent)?.id ?? null,
    ...panel,
  }
}
