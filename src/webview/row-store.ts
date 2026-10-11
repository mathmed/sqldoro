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
  // A row of a view version: the one held now, or the one before while the new one comes.
  readonly row: (index: number, viewVersion: number) => WireRow | undefined
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
  #staleVersion = 0
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

  readonly row = (index: number, viewVersion: number): WireRow | undefined => {
    if (viewVersion === this.#viewVersion) {
      return this.#cache.get(index)
    }
    return viewVersion === this.#staleVersion ? this.#stale?.get(index) : undefined
  }

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
      this.#putAside()
      this.#viewVersion = viewVersion
    }
    return this.#cache.windowsToFetch(range.first, range.last, rowCount)
  }

  // The rows of the version held go aside while those of a newer one come; a version without rows
  // leaves the last ones with rows there.
  #putAside(): void {
    if (this.#cache.size > 0) {
      this.#stale = this.#cache
      this.#staleVersion = this.#viewVersion
    }
    this.#cache = new RowCache(WINDOW_ROWS, MAX_HELD_ROWS)
  }

  // Rows of an older view version are dropped: the grid already shows another order. The rows put
  // aside stay until the view shows the new ones (the grid of before reads them by their version).
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

// The rows of a store as the grid shows them: the columns it shows, in its order.
export function projectedRows(store: RowView, shown: Shown): RowView {
  return {
    ...store,
    row: (index, viewVersion) => {
      const row = store.row(index, viewVersion)
      return row === undefined ? undefined : projectRow(row, shown)
    },
  }
}
