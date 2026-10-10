import { RowStore } from './row-store.ts'

// One row store per tab of the run; the stores of tabs that are gone are dropped.
export class RowStores {
  readonly #stores = new Map<string, RowStore>()

  of(tabId: string): RowStore {
    const existing = this.#stores.get(tabId)
    if (existing !== undefined) {
      return existing
    }
    const store = new RowStore()
    this.#stores.set(tabId, store)
    return store
  }

  retain(tabIds: ReadonlySet<string>): void {
    for (const tabId of [...this.#stores.keys()]) {
      if (!tabIds.has(tabId)) {
        this.#stores.delete(tabId)
      }
    }
  }
}
