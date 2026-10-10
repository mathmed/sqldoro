// In-memory stand-ins for the storage VS Code gives an extension: the global state Memento and
// SecretStorage. Values go through JSON like VS Code does.
import type * as vscode from 'vscode'

import { EventEmitter } from '../vscode.ts'

export class FakeMemento implements vscode.Memento {
  readonly #values = new Map<string, unknown>()

  keys(): readonly string[] {
    return [...this.#values.keys()]
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.#values.has(key) ? (this.#values.get(key) as T) : defaultValue
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.#values.delete(key)
    } else {
      this.#values.set(key, JSON.parse(JSON.stringify(value)))
    }
    return Promise.resolve()
  }

  setKeysForSync(): void {
    // VS Code would sync these keys with Settings Sync; nothing to do in memory.
  }
}

export class FakeSecretStorage implements vscode.SecretStorage {
  readonly values = new Map<string, string>()
  readonly #onDidChange = new EventEmitter<vscode.SecretStorageChangeEvent>()
  readonly onDidChange = this.#onDidChange.event as vscode.Event<vscode.SecretStorageChangeEvent>

  async keys(): Promise<string[]> {
    return Promise.resolve([...this.values.keys()])
  }

  async get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.values.get(key))
  }

  async store(key: string, value: string): Promise<void> {
    this.values.set(key, value)
    this.#onDidChange.fire({ key })
    return Promise.resolve()
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key)
    this.#onDidChange.fire({ key })
    return Promise.resolve()
  }
}
