import { RowCache } from '../core/grid/row-cache.ts'
import type { WireRow } from '../core/results/protocol.ts'

// The grid asks for rows a window at a time and holds a few thousand at most.
export const WINDOW_ROWS = 200
const MAX_HELD_ROWS = 4000

// The rows of one tab the webview holds, for the view version they belong to. React components
// subscribe to it (useSyncExternalStore) and re-render when rows arrive.
export class RowStore {
  readonly #cache = new RowCache(WINDOW_ROWS, MAX_HELD_ROWS)
  readonly #listeners = new Set<() => void>()
  #viewVersion = 0
  #revision = 0

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  readonly revision = (): number => this.#revision

  row(index: number): WireRow | undefined {
    return this.#cache.get(index)
  }

  // The windows to ask for to show rows first to last; a new view version forgets the old rows.
  windowsToFetch(
    range: { readonly first: number; readonly last: number },
    rowCount: number,
    viewVersion: number,
  ): number[] {
    if (viewVersion !== this.#viewVersion) {
      this.#viewVersion = viewVersion
      this.#cache.clear()
    }
    return this.#cache.windowsToFetch(range.first, range.last, rowCount)
  }

  // Rows of an older view version are dropped: the grid already shows another order.
  store(viewVersion: number, start: number, rows: readonly WireRow[]): void {
    if (viewVersion !== this.#viewVersion) {
      return
    }
    this.#cache.store(start, rows)
    this.#revision += 1
    for (const listener of [...this.#listeners]) {
      listener()
    }
  }
}
