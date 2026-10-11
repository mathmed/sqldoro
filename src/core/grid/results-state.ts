import type { Crumb } from '../navigation/history.ts'
import {
  type HostMessage,
  HostMessageType,
  type PanelConnection,
  type ResultTab,
  type SqlMessage,
} from '../results/protocol.ts'

// What the result webview shows: the connection of the editor, how its SQL is written, the trail of
// a table panel, the tabs of the last run, and the one in front.
export interface ResultsState {
  readonly connection: PanelConnection | null
  readonly sql: Omit<SqlMessage, 'type'> | null
  readonly crumbs: readonly Crumb[]
  readonly tabs: readonly ResultTab[]
  readonly activeTabId: string | null
}

export const EMPTY_RESULTS: ResultsState = {
  connection: null,
  sql: null,
  crumbs: [],
  tabs: [],
  activeTabId: null,
}

type MessageOf<T extends HostMessage['type']> = Extract<HostMessage, { readonly type: T }>
type Reducer = (state: ResultsState, message: HostMessage) => ResultsState

function reducer<T extends HostMessage['type']>(
  type: T,
  reduce: (state: ResultsState, message: MessageOf<T>) => ResultsState,
): readonly [string, Reducer] {
  return [type, (state, message) => reduce(state, message as MessageOf<T>)]
}

// A list of tabs replaces the run; a tab updates its own, and a new one comes to the front. Rows,
// cells and what goes to one part of the view leave the state as it is.
const REDUCERS: ReadonlyMap<string, Reducer> = new Map([
  reducer(HostMessageType.Tabs, (state, message) => ({
    ...state,
    tabs: message.tabs,
    activeTabId: message.activeTabId ?? lastId(message.tabs),
  })),
  reducer(HostMessageType.Tab, (state, message) => withTab(state, message.tab)),
  reducer(HostMessageType.Connection, (state, message) => ({
    ...state,
    connection: message.connection,
  })),
  reducer(HostMessageType.Trail, (state, message) => ({ ...state, crumbs: message.crumbs })),
  reducer(HostMessageType.Sql, (state, message) => ({
    ...state,
    sql: {
      identifierQuote: message.identifierQuote,
      lexical: message.lexical,
      keywords: message.keywords,
    },
  })),
])

export function reduceResults(state: ResultsState, message: HostMessage): ResultsState {
  return REDUCERS.get(message.type)?.(state, message) ?? state
}

function lastId(tabs: readonly ResultTab[]): string | null {
  return tabs.at(-1)?.id ?? null
}

function withTab(state: ResultsState, tab: ResultTab): ResultsState {
  const isNew = !state.tabs.some((existing) => existing.id === tab.id)
  return isNew
    ? { ...state, tabs: [...state.tabs, tab], activeTabId: tab.id }
    : { ...state, tabs: state.tabs.map((existing) => (existing.id === tab.id ? tab : existing)) }
}

export function activateTab(state: ResultsState, tabId: string): ResultsState {
  return state.tabs.some((tab) => tab.id === tabId) ? { ...state, activeTabId: tabId } : state
}

export function activeTab(state: ResultsState): ResultTab | undefined {
  return state.tabs.find((tab) => tab.id === state.activeTabId)
}
