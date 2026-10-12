import { useSyncExternalStore } from 'react'

import { type Indicator, IndicatorLook } from '../core/grid/loading-indicator.ts'
import { isViewReady } from '../core/grid/shown-tab.ts'
import { type ResultTab, TabStatus } from '../core/results/protocol.ts'
import type { RowView } from './row-store.ts'
import { useWaitIndicator, type WaitIndicator } from './wait-indicator.ts'

// How the result on screen stands while the view waits.
export interface Waiting {
  readonly indicator: Indicator
  // The tab the view waits for, while the result on screen is the one of before: a new view of its
  // tab, or the tab of a new run.
  readonly incoming: ResultTab | undefined
  // The tab the card speaks of: the one coming, or the one on screen.
  readonly awaited: ResultTab
  readonly isWaiting: boolean
  // The result is not ready to show yet (its statement runs, or its first rows are not here): its
  // toolbar and status stay out of sight until it is.
  readonly isEmpty: boolean
  // Rows of the result are here: while it is not ready, they take the place of the skeleton.
  readonly hasRows: boolean
}

interface WaitSources {
  readonly tab: ResultTab
  readonly store: RowView
  readonly incoming: ResultTab | undefined
  readonly indicator: WaitIndicator
}

// The view waits while a result of before stays on screen, while the result shown has nothing to
// show yet, and while its statement runs.
export function useWaiting({ tab, store, incoming, indicator }: WaitSources): Waiting {
  const hasRows = useSyncExternalStore(store.subscribe, () => store.holds(tab.viewVersion))
  // A result of before was shown ready; its rows may now be put aside for the new ones.
  const isEmpty = incoming === undefined && !isViewReady(tab, hasRows)
  const isWaiting = incoming !== undefined || isEmpty || tab.status === TabStatus.Running
  return {
    indicator: useWaitIndicator(indicator, isWaiting),
    incoming,
    awaited: incoming ?? tab,
    isWaiting,
    isEmpty,
    hasRows,
  }
}

// Before the first rows of a result, once the wait shows, a skeleton stands where they go.
export function hasSkeleton({ isEmpty, hasRows, indicator }: Waiting): boolean {
  return isEmpty && !hasRows && indicator.look !== IndicatorLook.Hidden
}

export function viewClassName(waiting: Waiting): string {
  if (isPending(waiting)) {
    return 'result-view is-pending'
  }
  return waiting.isEmpty ? 'result-view is-empty' : 'result-view'
}

// A result with nothing to show yet stays out of sight (in its place) until its rows come or the
// wait shows: a fast load shows the whole result at once.
function isPending({ isEmpty, indicator }: Waiting): boolean {
  return isEmpty && indicator.look === IndicatorLook.Hidden
}

// The result of before dims while the wait shows.
export function isDimmed({ incoming, indicator }: Waiting): boolean {
  return incoming !== undefined && indicator.look === IndicatorLook.Shown
}
