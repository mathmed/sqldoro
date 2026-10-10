import * as vscode from 'vscode'

import {
  addHistoryEntry,
  HISTORY_FORMAT,
  type HistoryEntry,
  removeEntry,
  retainConnections,
} from '../../core/history/history.ts'
import { decodeList, encodeList } from '../../core/json/versioned-list.ts'
import type { Logger } from '../../core/platform.ts'

// The query history, in the global state of the extension (not synced): at most a set number of
// statements per connection, without passwords (they are masked before they get here).
const HISTORY_KEY = 'sqldoro.history'

export class HistoryStore implements vscode.Disposable {
  readonly #memento: vscode.Memento
  readonly #maxPerConnection: () => number
  readonly #unreadable: readonly unknown[]
  readonly #isWritable: boolean
  readonly #changes = new vscode.EventEmitter<undefined>()
  #entries: readonly HistoryEntry[]
  readonly onDidChange = this.#changes.event

  constructor(memento: vscode.Memento, log: Logger, maxPerConnection: () => number) {
    this.#memento = memento
    this.#maxPerConnection = maxPerConnection
    const decoded = decodeList(memento.get(HISTORY_KEY), HISTORY_FORMAT)
    for (const problem of decoded.problems) {
      log.warn(problem)
    }
    this.#entries = decoded.items
    this.#unreadable = decoded.unreadable
    this.#isWritable = decoded.isWritable
  }

  list(): readonly HistoryEntry[] {
    return this.#entries
  }

  find(id: string): HistoryEntry | undefined {
    return this.#entries.find((entry) => entry.id === id)
  }

  async add(entry: HistoryEntry): Promise<void> {
    await this.#write(addHistoryEntry(this.#entries, entry, this.#maxPerConnection()))
  }

  async remove(id: string): Promise<void> {
    await this.#write(removeEntry(this.#entries, id))
  }

  async clear(): Promise<void> {
    await this.#write([])
  }

  // The history of connections that no longer exist goes with them.
  async retain(connectionIds: ReadonlySet<string>): Promise<void> {
    const kept = retainConnections(this.#entries, connectionIds)
    if (kept.length !== this.#entries.length) {
      await this.#write(kept)
    }
  }

  dispose(): void {
    this.#changes.dispose()
  }

  async #write(entries: readonly HistoryEntry[]): Promise<void> {
    if (!this.#isWritable) {
      throw new Error(
        'sqldoro cannot change the query history because it cannot read it: see the sqldoro output',
      )
    }
    if (entries === this.#entries) {
      return
    }
    await this.#memento.update(HISTORY_KEY, encodeList(entries, this.#unreadable, HISTORY_FORMAT))
    this.#entries = entries
    this.#changes.fire(undefined)
  }
}
