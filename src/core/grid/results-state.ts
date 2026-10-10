import {
  type HostMessage,
  HostMessageType,
  type PanelConnection,
  type ResultTab,
} from '../results/protocol.ts'

// What the result webview shows: the connection of the editor, the tabs of the last run, and the
// one in front.
export interface ResultsState {
  readonly connection: PanelConnection | null
  readonly tabs: readonly ResultTab[]
  readonly activeTabId: string | null
}

export const EMPTY_RESULTS: ResultsState = { connection: null, tabs: [], activeTabId: null }

// A list of tabs replaces the run; a tab updates its own, and a new one comes to the front.
export function reduceResults(state: ResultsState, message: HostMessage): ResultsState {
  switch (message.type) {
    case HostMessageType.Tabs:
      return {
        ...state,
        tabs: message.tabs,
        activeTabId: message.activeTabId ?? lastId(message.tabs),
      }
    case HostMessageType.Tab:
      return withTab(state, message.tab)
    case HostMessageType.Connection:
      return { ...state, connection: message.connection }
    default:
      return state
  }
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
