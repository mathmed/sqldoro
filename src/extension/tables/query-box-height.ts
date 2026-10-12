import type * as vscode from 'vscode'

import { storedHeight } from '../../core/grid/query-mode.ts'

// The height the user gave the query box of the table panels, in the state of the workspace: every
// table panel opens its box as tall.
const HEIGHT_KEY = 'sqldoro.queryBoxHeight'

export class QueryBoxHeight {
  readonly #memento: vscode.Memento

  constructor(memento: vscode.Memento) {
    this.#memento = memento
  }

  // Null until the user chooses one, or when what is kept is not a height.
  get(): number | null {
    return storedHeight(this.#memento.get(HEIGHT_KEY))
  }

  async set(height: number): Promise<void> {
    await this.#memento.update(HEIGHT_KEY, height)
  }
}
