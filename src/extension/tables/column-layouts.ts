import type * as vscode from 'vscode'

import type { ObjectRef } from '../../core/engine/catalog.ts'
import type { ColumnLayout } from '../../core/grid/column-layout.ts'
import {
  layoutFor,
  retainLayouts,
  SAVED_LAYOUT_FORMAT,
  type SavedLayout,
  storedLayout,
  withSavedLayout,
} from '../../core/grid/saved-layouts.ts'
import { decodeList, encodeList } from '../../core/json/versioned-list.ts'
import type { Logger } from '../../core/platform.ts'

// The columns each table panel shows, per table, in the state of the workspace: the next time the
// rows of the table open, the grid shows the same columns in the same order.
const LAYOUTS_KEY = 'sqldoro.columnLayouts'

export class ColumnLayouts {
  readonly #memento: vscode.Memento
  readonly #unreadable: readonly unknown[]
  readonly #isWritable: boolean
  #saved: readonly SavedLayout[]

  constructor(memento: vscode.Memento, log: Logger) {
    this.#memento = memento
    const decoded = decodeList(memento.get(LAYOUTS_KEY), SAVED_LAYOUT_FORMAT)
    for (const problem of decoded.problems) {
      log.warn(problem)
    }
    this.#saved = decoded.items
    this.#unreadable = decoded.unreadable
    this.#isWritable = decoded.isWritable
  }

  get(connectionId: string, table: ObjectRef): ColumnLayout {
    return layoutFor(this.#saved, connectionId, table)
  }

  async save(connectionId: string, table: ObjectRef, layout: ColumnLayout): Promise<void> {
    await this.#write(withSavedLayout(this.#saved, { connectionId, table, layout }))
  }

  // The layouts of connections that no longer exist go with them.
  async retain(connectionIds: ReadonlySet<string>): Promise<void> {
    const kept = retainLayouts(this.#saved, connectionIds)
    if (kept.length !== this.#saved.length) {
      await this.#write(kept)
    }
  }

  // Layouts written by a newer version are left as they are: they only change how columns show.
  async #write(saved: readonly SavedLayout[]): Promise<void> {
    this.#saved = saved
    if (this.#isWritable) {
      await this.#memento.update(
        LAYOUTS_KEY,
        encodeList(saved.map(storedLayout), this.#unreadable, SAVED_LAYOUT_FORMAT),
      )
    }
  }
}
