import * as vscode from 'vscode'

import { ContextKey } from '../command-id.ts'
import type { SavedQueryStore } from './saved-query-store.ts'

// The saved query each SQL editor opened from one edits, by document URI: Save Query updates it in
// place. Kept for the session only, like the untitled documents it follows.
export class SavedQueryLinks implements vscode.Disposable {
  readonly #links = new Map<string, string>()
  readonly #changes = new vscode.EventEmitter<undefined>()
  readonly onDidChange = this.#changes.event

  queryOf(uri: vscode.Uri): string | undefined {
    return this.#links.get(uri.toString())
  }

  // The document that edits the saved query, if one is open.
  documentOf(queryId: string): string | undefined {
    return [...this.#links].find(([, id]) => id === queryId)?.[0]
  }

  link(uri: vscode.Uri, queryId: string): void {
    this.#links.set(uri.toString(), queryId)
    this.#changes.fire(undefined)
  }

  unlink(uri: vscode.Uri): void {
    if (this.#links.delete(uri.toString())) {
      this.#changes.fire(undefined)
    }
  }

  // Editors of a saved query that no longer exists lose their link.
  retain(queryIds: ReadonlySet<string>): void {
    const gone = [...this.#links].filter(([, id]) => !queryIds.has(id))
    for (const [uri] of gone) {
      this.#links.delete(uri)
    }
    if (gone.length > 0) {
      this.#changes.fire(undefined)
    }
  }

  dispose(): void {
    this.#changes.dispose()
  }
}

// A closed editor or a deleted saved query ends the link, and the menus know whether the editor in
// front edits a saved query.
export function followSavedQueryLinks(
  links: SavedQueryLinks,
  store: SavedQueryStore,
): vscode.Disposable[] {
  const update = (): void => {
    const uri = vscode.window.activeTextEditor?.document.uri
    const isLinked = uri !== undefined && links.queryOf(uri) !== undefined
    void vscode.commands.executeCommand('setContext', ContextKey.IsSavedQueryEditor, isLinked)
  }
  update()
  return [
    vscode.window.onDidChangeActiveTextEditor(update),
    links.onDidChange(update),
    vscode.workspace.onDidCloseTextDocument((document) => {
      links.unlink(document.uri)
    }),
    store.onDidChange(() => {
      links.retain(new Set(store.list().map((query) => query.id)))
    }),
  ]
}
