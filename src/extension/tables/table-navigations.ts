import * as vscode from 'vscode'

import { currentStep, type Navigation, type TableStep } from '../../core/navigation/history.ts'
import { tableTargetOf } from './table-uri.ts'

export interface TrailChange {
  readonly uri: vscode.Uri
  readonly navigation: Navigation
}

// The trail of each table panel: the steps a navigation went through, the one shown, and what the
// user chose on each (its WHERE, its view). A panel opened from the explorer starts a trail of one
// step; navigating from a row adds steps.
export class TableNavigations implements vscode.Disposable {
  readonly #entries = new Map<string, TrailChange>()
  readonly #changes = new vscode.EventEmitter<TrailChange>()
  // A panel whose trail changed, and its trail now: its view shows it again.
  readonly onDidChange = this.#changes.event

  get(uri: vscode.Uri): Navigation | undefined {
    return this.#entries.get(uri.toString())?.navigation
  }

  // The step a table panel shows.
  current(uri: vscode.Uri): TableStep | undefined {
    const navigation = this.get(uri)
    return navigation === undefined ? undefined : currentStep(navigation)
  }

  set(uri: vscode.Uri, navigation: Navigation): void {
    const entry = { uri, navigation }
    this.#entries.set(uri.toString(), entry)
    this.#changes.fire(entry)
  }

  // Changes the trail of a panel that has one; false when nothing changed.
  update(uri: vscode.Uri, change: (navigation: Navigation) => Navigation | undefined): boolean {
    const navigation = this.get(uri)
    const changed = navigation === undefined ? undefined : change(navigation)
    if (changed !== undefined) {
      this.set(uri, changed)
    }
    return changed !== undefined
  }

  forget(uri: vscode.Uri): void {
    this.#entries.delete(uri.toString())
  }

  // A panel of the connection that shows these rows now, so that opening them again shows it
  // instead of one panel more.
  showing(connectionId: string, rows: Pick<TableStep, 'key' | 'table'>): vscode.Uri | undefined {
    const wanted = stepKey(rows)
    return [...this.#entries.values()].find(
      ({ uri, navigation }) =>
        tableTargetOf(uri)?.connectionId === connectionId &&
        stepKey(currentStep(navigation)) === wanted,
    )?.uri
  }

  dispose(): void {
    this.#entries.clear()
    this.#changes.dispose()
  }
}

function stepKey({ table, key }: Pick<TableStep, 'key' | 'table'>): string {
  return JSON.stringify([table, key ?? null])
}
