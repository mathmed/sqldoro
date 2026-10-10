import {
  changesSession,
  type ConnectionConfig,
  duplicateConnection,
  newConnection,
} from '../../core/connection/connection.ts'
import { nameKey } from '../../core/connection/names.ts'
import { parseConnectionUrl, type UrlImport } from '../../core/connection/url.ts'
import { validateConnection, type ValidationIssue } from '../../core/connection/validation.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { SessionManager } from '../sessions/session-manager.ts'
import type { ConnectionStore } from '../storage/connection-store.ts'
import type { SecretChanges, SecretStore } from '../storage/secret-store.ts'

export interface ConnectionServiceDependencies {
  readonly store: ConnectionStore
  readonly secrets: SecretStore
  readonly sessions: SessionManager
  readonly engines: EngineRegistry
  readonly createId: () => string
}

// Adds, changes and removes connections: the metadata, their secrets and their open session move
// together.
export class ConnectionService {
  readonly #dependencies: ConnectionServiceDependencies

  constructor(dependencies: ConnectionServiceDependencies) {
    this.#dependencies = dependencies
  }

  get engines(): EngineRegistry {
    return this.#dependencies.engines
  }

  list(): readonly ConnectionConfig[] {
    return this.#dependencies.store.list()
  }

  find(id: string): ConnectionConfig | undefined {
    return this.#dependencies.store.find(id)
  }

  // A new connection starts on the first registered engine.
  draft(): ConnectionConfig {
    const [engine] = this.#dependencies.engines.engines
    if (engine === undefined) {
      throw new Error('sqldoro has no database engine registered')
    }
    return newConnection(this.#dependencies.createId(), engine)
  }

  // The connection a URL holds, as the connection of this id.
  importUrl(url: string, id: string): UrlImport {
    const { engines } = this.#dependencies
    return parseConnectionUrl(url, { engines, id, takenNameKeys: this.takenNameKeys(id) })
  }

  validate(connection: ConnectionConfig): readonly ValidationIssue[] {
    return validateConnection(connection, {
      engines: this.#dependencies.engines.engines,
      takenNameKeys: this.takenNameKeys(connection.id),
    })
  }

  // The secrets go first: when the keyring fails, the connection is not saved half way, and saving
  // again writes both.
  async save(connection: ConnectionConfig, secretChanges: SecretChanges): Promise<void> {
    const [issue] = this.validate(connection)
    if (issue !== undefined) {
      throw new Error(issue.message)
    }
    const previous = this.find(connection.id)
    await this.#dependencies.secrets.apply(connection, secretChanges)
    await this.#dependencies.store.save(connection)
    const isSessionStale =
      previous !== undefined && (secretChanges.size > 0 || changesSession(previous, connection))
    if (isSessionStale) {
      await this.#dependencies.sessions.disconnect(connection.id)
    }
  }

  async delete(id: string): Promise<void> {
    await this.#dependencies.sessions.disconnect(id)
    await this.#dependencies.secrets.deleteAll(id)
    await this.#dependencies.store.delete(id)
  }

  async duplicate(source: ConnectionConfig): Promise<ConnectionConfig> {
    const copy = duplicateConnection(source, this.#dependencies.createId(), this.takenNameKeys(''))
    await this.#dependencies.secrets.copy(source, copy)
    await this.#dependencies.store.save(copy)
    return copy
  }

  // The name keys (see nameKey) of the connections other than this one.
  takenNameKeys(exceptId: string): ReadonlySet<string> {
    return new Set(
      this.list()
        .filter((connection) => connection.id !== exceptId)
        .map((connection) => nameKey(connection.name)),
    )
  }
}
