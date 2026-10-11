import { useEffect, useState, useSyncExternalStore } from 'react'

import { activeTab, type ResultsState } from '../core/grid/results-state.ts'
import { isViewReady, type ShownTab, tabToShow } from '../core/grid/shown-tab.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import { ROW_HEIGHT } from './grid-model.ts'
import type { ResultsApi } from './results-api.ts'
import type { RowStores } from './row-stores.ts'
import { requestRows } from './use-row-window.ts'

interface Panel {
  readonly api: ResultsApi
  readonly stores: RowStores
  // Where the grid of each step of a trail was scrolled to.
  readonly scrolls: ReadonlyMap<number, number>
}

const NO_SUBSCRIPTION = (): (() => void) => () => undefined

// The tab the view shows, and the one it waits for while the result of before stays (see
// tabToShow). The rows of a tab of a new run are asked for before its grid exists, so that it shows
// with them; the stores of the tabs gone go, but for the one still on screen.
export function useShownTab(state: ResultsState, panel: Panel): ShownTab {
  const { stores } = panel
  useActiveRows(state, stores)
  const [settled, setSettled] = useState<ResultTab>()
  const shown = tabToShow(settled, state, (tab) =>
    isViewReady(tab, stores.of(tab.id).holds(tab.viewVersion)),
  )
  if (shown.settled !== settled) {
    setSettled(shown.settled)
  }
  useIncomingRows(shown, { ...panel, step: currentStep(state) })
  const shownId = shown.tab?.id
  useEffect(() => {
    stores.retain(
      new Set([...state.tabs.map((tab) => tab.id), ...(shownId === undefined ? [] : [shownId])]),
    )
  }, [state.tabs, shownId, stores])
  return shown
}

// The view shows the tab in front once its first rows come: it follows them.
function useActiveRows(state: ResultsState, stores: RowStores): void {
  const active = activeTab(state)
  const store = active === undefined ? undefined : stores.of(active.id)
  useSyncExternalStore(
    store?.subscribe ?? NO_SUBSCRIPTION,
    () => active !== undefined && store?.holds(active.viewVersion) === true,
  )
}

type Wanted = Pick<ResultTab, 'id' | 'rowCount' | 'viewVersion'>

const NOTHING_WANTED: Wanted = { id: '', rowCount: 0, viewVersion: 0 }

// The first rows of the tab of a new run, from where its step of the trail was scrolled to; a new
// view of the tab shown is asked for by its grid, which knows the rows it shows.
function useIncomingRows(
  shown: ShownTab,
  { api, stores, scrolls, step }: Panel & { readonly step: number | null },
): void {
  const { id, rowCount, viewVersion } = otherIncoming(shown) ?? NOTHING_WANTED
  const first = scrolledRow(scrolls, step)
  useEffect(() => {
    if (id !== '') {
      const store = stores.of(id)
      requestRows(api, { id, rowCount, viewVersion }, { store, range: { first, last: first } })
    }
  }, [api, stores, id, rowCount, viewVersion, first])
}

function otherIncoming({ tab, incoming }: ShownTab): ResultTab | undefined {
  return incoming?.id === tab?.id ? undefined : incoming
}

// The first row the grid of a step showed when it was last shown.
function scrolledRow(scrolls: ReadonlyMap<number, number>, step: number | null): number {
  const top = step === null ? undefined : scrolls.get(step)
  return Math.floor((top ?? 0) / ROW_HEIGHT)
}

function currentStep(state: ResultsState): number | null {
  return state.crumbs.find((crumb) => crumb.isCurrent)?.id ?? null
}
