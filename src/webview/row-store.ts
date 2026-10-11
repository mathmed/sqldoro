import { projectRow, type Shown } from '../core/grid/column-projection.ts'
import { RowCache } from '../core/grid/row-cache.ts'
import type { WireRow } from '../core/results/protocol.ts'

// The grid asks for rows a window at a time and holds a few thousand at most.
export const WINDOW_ROWS = 200
const MAX_HELD_ROWS = 4000

// What the grid reads its rows from: the rows of a tab the webview holds, as the grid shows them.
export interface RowView {
  readonly subscribe: (listener: () => void) => () => void
  readonly revision: () => number
  readonly row: (index: number) => WireRow | undefined
  // Whether rows of this view version are here.
  readonly holds: (viewVersion: number) => boolean
  readonly windowsToFetch: (
    range: { readonly first: number; readonly last: number },
    rowCount: number,
    viewVersion: number,
  ) => number[]
}

// The rows of one tab the webview holds, for the view version they belong to. React components
// subscribe to it (useSyncExternalStore) and re-render when rows arrive. While the rows of a new
// version are on their way (a refresh), the grid keeps showing those of the old one; a version
// only ever moves forward, so a grid still showing the old one asks for nothing.
export class RowStore implements RowView {
  #cache = new RowCache(WINDOW_ROWS, MAX_HELD_ROWS)
  #stale: RowCache | undefined
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

  readonly row = (index: number): WireRow | undefined =>
    this.#cache.get(index) ?? this.#stale?.get(index)

  readonly holds = (viewVersion: number): boolean =>
    viewVersion === this.#viewVersion && this.#cache.size > 0

  // The windows to ask for to show rows first to last; a new view version puts the old rows aside,
  // and an older one has nothing left to ask for.
  readonly windowsToFetch = (
    range: { readonly first: number; readonly last: number },
    rowCount: number,
    viewVersion: number,
  ): number[] => {
    if (viewVersion < this.#viewVersion) {
      return []
    }
    if (viewVersion > this.#viewVersion) {
      this.#viewVersion = viewVersion
      this.#stale = this.#cache.size === 0 ? this.#stale : this.#cache
      this.#cache = new RowCache(WINDOW_ROWS, MAX_HELD_ROWS)
    }
    return this.#cache.windowsToFetch(range.first, range.last, rowCount)
  }

  // Rows of an older view version are dropped: the grid already shows another order. The first
  // rows of the new version replace the old ones.
  store(viewVersion: number, start: number, rows: readonly WireRow[]): void {
    if (viewVersion !== this.#viewVersion) {
      return
    }
    this.#stale = undefined
    this.#cache.store(start, rows)
    this.#revision += 1
    for (const listener of [...this.#listeners]) {
      listener()
    }
  }
}

// The rows of a store as the grid shows them: the columns it shows, in its order.
export function projectedRows(store: RowView, shown: Shown): RowView {
  return {
    ...store,
    row: (index) => {
      const row = store.row(index)
      return row === undefined ? undefined : projectRow(row, shown)
    },
  }
}
