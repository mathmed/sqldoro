import * as vscode from 'vscode'

import { decodeList, encodeList } from '../../core/json/versioned-list.ts'
import type { Logger } from '../../core/platform.ts'
import {
  deleteQuery,
  putQuery,
  SAVED_QUERY_FORMAT,
  type SavedQuery,
} from '../../core/snippets/saved-queries.ts'

// The saved queries, in the global state of the extension (not synced).
const SAVED_QUERIES_KEY = 'sqldoro.savedQueries'

export class SavedQueryStore implements vscode.Disposable {
  readonly #memento: vscode.Memento
  readonly #unreadable: readonly unknown[]
  readonly #isWritable: boolean
  readonly #changes = new vscode.EventEmitter<undefined>()
  #queries: readonly SavedQuery[]
  readonly onDidChange = this.#changes.event

  constructor(memento: vscode.Memento, log: Logger) {
    this.#memento = memento
    const decoded = decodeList(memento.get(SAVED_QUERIES_KEY), SAVED_QUERY_FORMAT)
    for (const problem of decoded.problems) {
      log.warn(problem)
    }
    this.#queries = decoded.items
    this.#unreadable = decoded.unreadable
    this.#isWritable = decoded.isWritable
  }

  list(): readonly SavedQuery[] {
    return this.#queries
  }

  find(id: string): SavedQuery | undefined {
    return this.#queries.find((query) => query.id === id)
  }

  async put(query: SavedQuery): Promise<void> {
    await this.replaceAll(putQuery(this.#queries, query))
  }

  async delete(id: string): Promise<void> {
    await this.replaceAll(deleteQuery(this.#queries, id))
  }

  async replaceAll(queries: readonly SavedQuery[]): Promise<void> {
    if (!this.#isWritable) {
      throw new Error(
        'sqldoro cannot change the saved queries because it cannot read them: see the sqldoro output',
      )
    }
    await this.#memento.update(
      SAVED_QUERIES_KEY,
      encodeList(queries, this.#unreadable, SAVED_QUERY_FORMAT),
    )
    this.#queries = queries
    this.#changes.fire(undefined)
  }

  dispose(): void {
    this.#changes.dispose()
  }
}
