import { type ResultTab, TabKind, TabStatus } from '../results/protocol.ts'
import { activeTab, type ResultsState } from './results-state.ts'

// Whether the result of a tab can replace what the view showed before: its statement ended, and
// the first rows of its view are here or it has none to fetch (no rows, an error, a plan). A result
// shows once, whole, not while its rows still stream in.
export function isViewReady(
  tab: Pick<ResultTab, 'kind' | 'rowCount' | 'status'>,
  hasRows: boolean,
): boolean {
  return tab.status !== TabStatus.Running && (hasRows || hasNothingToFetch(tab))
}

function hasNothingToFetch(tab: Pick<ResultTab, 'kind' | 'rowCount'>): boolean {
  return tab.rowCount === 0 || tab.kind === TabKind.Plan
}

export interface ShownTab {
  // The tab whose result is on screen.
  readonly tab: ResultTab | undefined
  // The tab the view waits for while the result of before stays on screen: a new view of the tab
  // shown, or the tab of a new run.
  readonly incoming: ResultTab | undefined
  // The tab shown last that was ready: what stays on screen during the next wait.
  readonly settled: ResultTab | undefined
}

// What the view shows: the tab in front once it is ready. Until then, the result shown ready before
// stays (the view says it waits) while a new view of its tab, or a new run that replaced it, is on
// its way: the grid never goes blank or flashes empty rows in between. Another tab of the same run
// shows at once, ready or not, and so does the first result of a panel.
export function tabToShow(
  settled: ResultTab | undefined,
  state: ResultsState,
  isReady: (tab: ResultTab) => boolean,
): ShownTab {
  const active = activeTab(state)
  if (active !== undefined && isReady(active)) {
    return { tab: active, incoming: undefined, settled: active }
  }
  if (settled === undefined || !isHeld(settled, state, active)) {
    return { tab: active, incoming: undefined, settled }
  }
  return { tab: settled, incoming: active, settled }
}

function isHeld(settled: ResultTab, state: ResultsState, active: ResultTab | undefined): boolean {
  return settled.id === active?.id || !state.tabs.some((tab) => tab.id === settled.id)
}
