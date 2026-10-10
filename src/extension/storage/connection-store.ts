import * as vscode from 'vscode'

import {
  decodeConnections,
  type DecodedConnections,
  encodeConnections,
} from '../../core/connection/codec.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { Logger } from '../../core/platform.ts'

// Everything about the connections except their secrets, in the global state of the extension.
const CONNECTIONS_KEY = 'sqldoro.connections'

export class ConnectionStore {
  readonly #memento: vscode.Memento
  readonly #changes = new vscode.EventEmitter<undefined>()
  #decoded: DecodedConnections
  readonly onDidChange = this.#changes.event

  constructor(memento: vscode.Memento, log: Logger) {
    this.#memento = memento
    this.#decoded = decodeConnections(memento.get(CONNECTIONS_KEY))
    for (const problem of this.#decoded.problems) {
      log.warn(problem)
    }
  }

  get problems(): readonly string[] {
    return this.#decoded.problems
  }

  list(): readonly ConnectionConfig[] {
    return this.#decoded.connections
  }

  find(id: string): ConnectionConfig | undefined {
    return this.#decoded.connections.find((connection) => connection.id === id)
  }

  async save(connection: ConnectionConfig): Promise<void> {
    const others = this.#decoded.connections.filter((saved) => saved.id !== connection.id)
    const isNew = others.length === this.#decoded.connections.length
    const connections = isNew
      ? [...others, connection]
      : this.#decoded.connections.map((saved) => (saved.id === connection.id ? connection : saved))
    await this.#write(connections)
  }

  async delete(id: string): Promise<void> {
    await this.#write(this.#decoded.connections.filter((connection) => connection.id !== id))
  }

  dispose(): void {
    this.#changes.dispose()
  }

  async #write(connections: readonly ConnectionConfig[]): Promise<void> {
    if (!this.#decoded.isWritable) {
      throw new Error(
        'sqldoro cannot change the saved connections because it cannot read them: see the sqldoro output',
      )
    }
    await this.#memento.update(
      CONNECTIONS_KEY,
      encodeConnections(connections, this.#decoded.unreadable),
    )
    this.#decoded = { ...this.#decoded, connections }
    this.#changes.fire(undefined)
  }
}
