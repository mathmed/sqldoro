import type * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { type ConnectionSecrets, SecretKind, secretKindsOf } from '../../core/connection/secrets.ts'

// Passwords and passphrases live only in VS Code's secret storage, one entry per connection and kind.
const ALL_KINDS: readonly SecretKind[] = Object.values(SecretKind)

// Changes to the secrets of a connection: an empty value removes the secret.
export type SecretChanges = ReadonlyMap<SecretKind, string>

function keyOf(id: string, kind: SecretKind): string {
  return `sqldoro.connection.${id}.${kind}`
}

export class SecretStore {
  readonly #secrets: vscode.SecretStorage

  constructor(secrets: vscode.SecretStorage) {
    this.#secrets = secrets
  }

  async read(connection: ConnectionConfig): Promise<ConnectionSecrets> {
    const kinds = secretKindsOf(connection)
    const values = await Promise.all(
      kinds.map(async (kind) => this.#secrets.get(keyOf(connection.id, kind))),
    )
    return new Map(
      kinds.flatMap((kind, index) => {
        const value = values.at(index)
        return value === undefined ? [] : [[kind, value] as const]
      }),
    )
  }

  async storedKinds(connection: ConnectionConfig): Promise<ReadonlySet<SecretKind>> {
    return new Set((await this.read(connection)).keys())
  }

  async apply(connection: ConnectionConfig, changes: SecretChanges): Promise<void> {
    for (const [kind, value] of changes) {
      await (value === ''
        ? this.#secrets.delete(keyOf(connection.id, kind))
        : this.#secrets.store(keyOf(connection.id, kind), value))
    }
    await this.#prune(connection)
  }

  async copy(from: ConnectionConfig, to: ConnectionConfig): Promise<void> {
    for (const [kind, value] of await this.read(from)) {
      await this.#secrets.store(keyOf(to.id, kind), value)
    }
  }

  async deleteAll(id: string): Promise<void> {
    await Promise.all(ALL_KINDS.map(async (kind) => this.#secrets.delete(keyOf(id, kind))))
  }

  // A secret the connection no longer uses (a tunnel removed, a key instead of a password) goes.
  async #prune(connection: ConnectionConfig): Promise<void> {
    const kept = new Set(secretKindsOf(connection))
    const stale = ALL_KINDS.filter((kind) => !kept.has(kind))
    await Promise.all(stale.map(async (kind) => this.#secrets.delete(keyOf(connection.id, kind))))
  }
}
