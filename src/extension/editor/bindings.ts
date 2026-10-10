import * as vscode from 'vscode'

import { BINDING_FORMAT, type EditorBinding } from '../../core/editor/binding.ts'
import { decodeList, encodeList } from '../../core/json/versioned-list.ts'
import type { Logger } from '../../core/platform.ts'

const BINDINGS_KEY = 'sqldoro.editorConnections'
// Untitled documents get their names again in a later window: only files keep their connection.
const PERSISTED_SCHEME = 'file'

// The connection each SQL editor runs on, by document URI.
export class EditorBindings implements vscode.Disposable {
  readonly #memento: vscode.Memento
  readonly #bindings = new Map<string, EditorBinding>()
  readonly #persisted = new Set<string>()
  readonly #unreadable: readonly unknown[]
  readonly #isWritable: boolean
  readonly #changes = new vscode.EventEmitter<string>()
  readonly onDidChange = this.#changes.event

  constructor(memento: vscode.Memento, log: Logger) {
    this.#memento = memento
    const decoded = decodeList(memento.get(BINDINGS_KEY), BINDING_FORMAT)
    for (const problem of decoded.problems) {
      log.warn(problem)
    }
    for (const { uri, ...binding } of decoded.items) {
      this.#bindings.set(uri, binding)
      this.#persisted.add(uri)
    }
    this.#unreadable = decoded.unreadable
    this.#isWritable = decoded.isWritable
  }

  get(uri: vscode.Uri): EditorBinding | undefined {
    return this.#bindings.get(uri.toString())
  }

  async set(uri: vscode.Uri, binding: EditorBinding): Promise<void> {
    const key = uri.toString()
    this.#bindings.set(key, binding)
    if (uri.scheme === PERSISTED_SCHEME) {
      this.#persisted.add(key)
    }
    await this.#changed(key)
  }

  // A closed untitled document is gone for good; a file keeps its connection for next time.
  async forgetUntitled(uri: vscode.Uri): Promise<void> {
    const key = uri.toString()
    if (!this.#persisted.has(key) && this.#bindings.delete(key)) {
      await this.#changed(key)
    }
  }

  // Editors on a connection that no longer exists lose it.
  async retain(connectionIds: ReadonlySet<string>): Promise<void> {
    const keys = [...this.#bindings].flatMap(([key, binding]) =>
      connectionIds.has(binding.connectionId) ? [] : [key],
    )
    for (const key of keys) {
      this.#bindings.delete(key)
      this.#persisted.delete(key)
      await this.#changed(key)
    }
  }

  dispose(): void {
    this.#changes.dispose()
  }

  async #changed(key: string): Promise<void> {
    this.#changes.fire(key)
    if (!this.#isWritable) {
      return
    }
    const items = [...this.#bindings]
      .filter(([uri]) => this.#persisted.has(uri))
      .map(([uri, binding]) => ({ uri, ...binding }))
    await this.#memento.update(BINDINGS_KEY, encodeList(items, this.#unreadable, BINDING_FORMAT))
  }
}
