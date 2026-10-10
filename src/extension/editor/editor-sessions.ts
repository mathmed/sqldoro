import type * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ConnectionSecrets } from '../../core/connection/secrets.ts'
import type { ObjectScope } from '../../core/engine/catalog.ts'
import type { Logger } from '../../core/platform.ts'
import type { Session } from '../../core/session/open-session.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SessionOpener } from '../sessions/session-opener.ts'

export interface EditorSessionDependencies {
  readonly open: SessionOpener
  readonly readSecrets: (connection: ConnectionConfig) => Promise<ConnectionSecrets>
  readonly log: Logger
}

interface Entry {
  readonly connectionId: string
  readonly session: Promise<Session>
}

function scopeKey(scope: ObjectScope): string {
  return JSON.stringify([scope.database, scope.schema])
}

// Each SQL editor runs on a connection of its own: a statement or a cancel in one editor never
// reaches another, and USE or search_path stay in the editor that set them.
export class EditorSessions implements vscode.Disposable {
  readonly #dependencies: EditorSessionDependencies
  readonly #entries = new Map<string, Entry>()
  readonly #scopes = new Map<string, string>()

  constructor(dependencies: EditorSessionDependencies) {
    this.#dependencies = dependencies
  }

  // The session of the editor, opened on first use and moved to the scope when it changed.
  async acquire(uri: string, connection: ConnectionConfig, scope: ObjectScope): Promise<Session> {
    const existing = this.#entries.get(uri)
    if (existing?.connectionId === connection.id) {
      const session = await existing.session
      await this.#move(uri, session, scope)
      return session
    }
    await this.release(uri)
    return this.#open(uri, connection, scope)
  }

  async release(uri: string): Promise<void> {
    const entry = this.#entries.get(uri)
    this.#entries.delete(uri)
    if (entry !== undefined) {
      await this.#close(entry)
    }
  }

  async releaseConnection(connectionId: string): Promise<void> {
    const uris = [...this.#entries].flatMap(([uri, entry]) =>
      entry.connectionId === connectionId ? [uri] : [],
    )
    await Promise.all(uris.map(async (uri) => this.release(uri)))
  }

  async releaseAll(): Promise<void> {
    await Promise.all([...this.#entries.keys()].map(async (uri) => this.release(uri)))
  }

  dispose(): void {
    void this.releaseAll()
  }

  async #open(uri: string, connection: ConnectionConfig, scope: ObjectScope): Promise<Session> {
    const entry: Entry = {
      connectionId: connection.id,
      session: this.#connect(uri, connection, scope),
    }
    this.#entries.set(uri, entry)
    this.#scopes.set(uri, scopeKey(scope))
    try {
      return await entry.session
    } catch (error) {
      if (this.#entries.get(uri) === entry) {
        this.#entries.delete(uri)
      }
      throw error
    }
  }

  async #connect(uri: string, connection: ConnectionConfig, scope: ObjectScope): Promise<Session> {
    const database = scope.database === '' ? connection.database : scope.database
    const session = await this.#dependencies.open({
      connection: { ...connection, database },
      secrets: await this.#dependencies.readSecrets(connection),
      onUnexpectedClose: (error) => {
        this.#dependencies.log.warn(`The connection of ${uri} ended: ${describeError(error)}`)
        this.#entries.delete(uri)
      },
    })
    try {
      await session.engineSession.useScope(scope)
    } catch (error) {
      await session.close()
      throw error
    }
    return session
  }

  async #move(uri: string, session: Session, scope: ObjectScope): Promise<void> {
    const key = scopeKey(scope)
    if (this.#scopes.get(uri) !== key) {
      await session.engineSession.useScope(scope)
      this.#scopes.set(uri, key)
    }
  }

  // Closing is best effort: what fails is logged.
  async #close(entry: Entry): Promise<void> {
    try {
      await (await entry.session).close()
    } catch (error) {
      this.#dependencies.log.warn(`Could not close an editor connection: ${describeError(error)}`)
    }
  }
}
