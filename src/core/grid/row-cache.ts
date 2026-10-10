import type { WireRow } from '../results/protocol.ts'

// The rows the webview holds: fetched from the host a window at a time, as the grid scrolls, and
// forgotten oldest first past a limit, so a million-row result never lives in the webview.
export class RowCache {
  readonly #windowSize: number
  readonly #maxRows: number
  readonly #rows = new Map<number, WireRow>()
  readonly #pending = new Set<number>()

  constructor(windowSize: number, maxRows: number) {
    this.#windowSize = windowSize
    this.#maxRows = maxRows
  }

  get size(): number {
    return this.#rows.size
  }

  get(index: number): WireRow | undefined {
    return this.#rows.get(index)
  }

  // The starts of the windows to fetch so that rows first to last (of rowCount) are held; they
  // count as pending until stored.
  windowsToFetch(first: number, last: number, rowCount: number): number[] {
    const starts: number[] = []
    const end = Math.min(last, rowCount - 1)
    for (let start = this.#windowStart(first); start <= end; start += this.#windowSize) {
      if (!this.#pending.has(start) && !this.#isLoaded(start, rowCount)) {
        this.#pending.add(start)
        starts.push(start)
      }
    }
    return starts
  }

  store(start: number, rows: readonly WireRow[]): void {
    this.#pending.delete(start)
    rows.forEach((row, offset) => {
      this.#rows.delete(start + offset)
      this.#rows.set(start + offset, row)
    })
    this.#evict()
  }

  clear(): void {
    this.#rows.clear()
    this.#pending.clear()
  }

  #windowStart(index: number): number {
    return Math.max(0, index - (index % this.#windowSize))
  }

  #isLoaded(start: number, rowCount: number): boolean {
    const end = Math.min(start + this.#windowSize, rowCount)
    for (let index = start; index < end; index += 1) {
      if (!this.#rows.has(index)) {
        return false
      }
    }
    return true
  }

  #evict(): void {
    for (const index of this.#rows.keys()) {
      if (this.#rows.size <= this.#maxRows) {
        return
      }
      this.#rows.delete(index)
    }
  }
}
