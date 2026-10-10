import type * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { type ConnectionSecrets, SecretKind, secretKindsOf } from '../../core/connection/secrets.ts'
import { withTimeout } from '../platform/timeout.ts'

// Passwords and passphrases live only in VS Code's secret storage, one entry per connection and kind.
const ALL_KINDS: readonly SecretKind[] = Object.values(SecretKind)

// Changes to the secrets of a connection: an empty value removes the secret.
export type SecretChanges = ReadonlyMap<SecretKind, string>

// Without a working system keyring, VS Code's secret storage can wait forever: sqldoro gives up
// and says why instead of hanging.
const SECRET_TIMEOUT_SECONDS = 10
const MILLISECONDS_PER_SECOND = 1000
export const SECRET_TIMEOUT_MS = SECRET_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND
const KEYRING_TIMEOUT = `The system keyring did not answer within ${String(SECRET_TIMEOUT_SECONDS)} seconds, so sqldoro cannot read or save passwords. Make sure a keyring is running (gnome-keyring or KWallet on Linux), or start VS Code with --password-store=basic.`

function keyOf(id: string, kind: SecretKind): string {
  return `sqldoro.connection.${id}.${kind}`
}

export class SecretStore {
  readonly #secrets: vscode.SecretStorage

  constructor(secrets: vscode.SecretStorage) {
    this.#secrets = secrets
  }

  async #get(key: string): Promise<string | undefined> {
    return withTimeout(this.#secrets.get(key), SECRET_TIMEOUT_MS, KEYRING_TIMEOUT)
  }

  async #store(key: string, value: string): Promise<void> {
    await withTimeout(this.#secrets.store(key, value), SECRET_TIMEOUT_MS, KEYRING_TIMEOUT)
  }

  async #delete(key: string): Promise<void> {
    await withTimeout(this.#secrets.delete(key), SECRET_TIMEOUT_MS, KEYRING_TIMEOUT)
  }

  async read(connection: ConnectionConfig): Promise<ConnectionSecrets> {
    const kinds = secretKindsOf(connection)
    const values = await Promise.all(
      kinds.map(async (kind) => this.#get(keyOf(connection.id, kind))),
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
        ? this.#delete(keyOf(connection.id, kind))
        : this.#store(keyOf(connection.id, kind), value))
    }
    await this.#prune(connection)
  }

  async copy(from: ConnectionConfig, to: ConnectionConfig): Promise<void> {
    for (const [kind, value] of await this.read(from)) {
      await this.#store(keyOf(to.id, kind), value)
    }
  }

  async deleteAll(id: string): Promise<void> {
    await Promise.all(ALL_KINDS.map(async (kind) => this.#delete(keyOf(id, kind))))
  }

  // A secret the connection no longer uses (a tunnel removed, a key instead of a password) goes.
  async #prune(connection: ConnectionConfig): Promise<void> {
    const kept = new Set(secretKindsOf(connection))
    const stale = ALL_KINDS.filter((kind) => !kept.has(kind))
    await Promise.all(stale.map(async (kind) => this.#delete(keyOf(connection.id, kind))))
  }
}
