import { type HostMessage, HostMessageType, type ResultTab } from '../results/protocol.ts'

// What the result webview shows: the tabs of the last run, and the one in front.
export interface ResultsState {
  readonly tabs: readonly ResultTab[]
  readonly activeTabId: string | null
}

export const EMPTY_RESULTS: ResultsState = { tabs: [], activeTabId: null }

// A list of tabs replaces the run; a tab updates its own, and a new one comes to the front.
export function reduceResults(state: ResultsState, message: HostMessage): ResultsState {
  if (message.type === HostMessageType.Tabs) {
    return { tabs: message.tabs, activeTabId: message.activeTabId ?? lastId(message.tabs) }
  }
  return message.type === HostMessageType.Tab ? withTab(state, message.tab) : state
}

function lastId(tabs: readonly ResultTab[]): string | null {
  return tabs.at(-1)?.id ?? null
}

function withTab(state: ResultsState, tab: ResultTab): ResultsState {
  const isNew = !state.tabs.some((existing) => existing.id === tab.id)
  return isNew
    ? { tabs: [...state.tabs, tab], activeTabId: tab.id }
    : { ...state, tabs: state.tabs.map((existing) => (existing.id === tab.id ? tab : existing)) }
}

export function activateTab(state: ResultsState, tabId: string): ResultsState {
  return state.tabs.some((tab) => tab.id === tabId) ? { ...state, activeTabId: tabId } : state
}

export function activeTab(state: ResultsState): ResultTab | undefined {
  return state.tabs.find((tab) => tab.id === state.activeTabId)
}
