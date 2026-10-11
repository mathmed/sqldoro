import { useEffect, useSyncExternalStore } from 'react'

import {
  IDLE_INDICATOR,
  type Indicator,
  nextChangeAt,
  stepIndicator,
} from '../core/grid/loading-indicator.ts'

// The indicator of a panel that waits for rows, stepped as the view waits and as time goes (the
// core decides how it looks when). One per panel: it goes on through a change of tab, so that the
// result that replaces another one does not show it again from the start. React components read it
// with useSyncExternalStore and re-render when it changes.
export class WaitIndicator {
  #indicator = IDLE_INDICATOR
  #isWaiting = false
  #timer: ReturnType<typeof setTimeout> | undefined
  readonly #listeners = new Set<() => void>()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  readonly current = (): Indicator => this.#indicator

  // The view waits, or no longer does.
  follow(isWaiting: boolean): void {
    this.#isWaiting = isWaiting
    this.#step()
  }

  // The panel is gone: nothing changes on its own any more.
  stop(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  readonly #step = (): void => {
    const next = stepIndicator(this.#indicator, this.#isWaiting, Date.now())
    this.stop()
    const at = nextChangeAt(next)
    if (at !== null) {
      this.#timer = setTimeout(this.#step, Math.max(at - Date.now(), 0))
    }
    if (next !== this.#indicator) {
      this.#indicator = next
      for (const listener of [...this.#listeners]) {
        listener()
      }
    }
  }
}

// The indicator as the view waits now.
export function useWaitIndicator(indicator: WaitIndicator, isWaiting: boolean): Indicator {
  useEffect(() => {
    indicator.follow(isWaiting)
  }, [indicator, isWaiting])
  return useSyncExternalStore(indicator.subscribe, indicator.current)
}
