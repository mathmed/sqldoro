import type * as vscode from 'vscode'

import { changesSession, type ConnectionConfig } from '../../core/connection/connection.ts'
import type { ConnectionSecrets } from '../../core/connection/secrets.ts'
import type { ObjectScope } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { Logger } from '../../core/platform.ts'
import type { Session } from '../../core/session/open-session.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SessionOpener } from '../sessions/session-opener.ts'
import { CloseReason } from '../transactions/editor-transactions.ts'

// What happens to the transaction of an editor when its session closes, ends or moves.
export interface SessionLifecycle {
  readonly beforeClose: (uri: string, session: EngineSession, reason: CloseReason) => Promise<void>
  readonly onLost: (uri: string) => void
  // A session with an open transaction must not move to another database or schema.
  readonly isPinned: (uri: string) => boolean
}

export interface EditorSessionDependencies {
  readonly open: SessionOpener
  readonly readSecrets: (connection: ConnectionConfig) => Promise<ConnectionSecrets>
  readonly log: Logger
  readonly lifecycle: SessionLifecycle
}

interface Entry {
  // The connection as the session was opened with it.
  readonly connection: ConnectionConfig
  readonly session: Promise<Session>
}

// What a session opens with, and what it calls when it ends by itself.
interface Opening {
  readonly connection: ConnectionConfig
  readonly scope: ObjectScope
  readonly onLost: (error: Error) => void
}

const PINNED =
  'Commit or roll back the open transaction of this editor before it changes database or schema.'

function scopeKey(scope: ObjectScope): string {
  return JSON.stringify([scope.database, scope.schema])
}

// Each SQL editor runs on a connection of its own: a statement or a cancel in one editor never
// reaches another, and USE, search_path and transactions stay in the editor that set them.
export class EditorSessions implements vscode.Disposable {
  readonly #dependencies: EditorSessionDependencies
  readonly #entries = new Map<string, Entry>()
  readonly #scopes = new Map<string, string>()

  constructor(dependencies: EditorSessionDependencies) {
    this.#dependencies = dependencies
  }

  // The session of the editor, opened on first use, opened again when the connection changed how it
  // reaches the server (or whether it may write), and moved to the scope when it changed.
  async acquire(uri: string, connection: ConnectionConfig, scope: ObjectScope): Promise<Session> {
    const existing = this.#entries.get(uri)
    if (existing !== undefined && isSameSession(existing.connection, connection)) {
      const session = await existing.session
      await this.#move(uri, session, scope)
      return session
    }
    await this.release(uri, CloseReason.ConnectionChanged)
    return this.#open(uri, connection, scope)
  }

  // The session the editor has, without opening one.
  existing(uri: string): Promise<Session> | undefined {
    return this.#entries.get(uri)?.session
  }

  async release(uri: string, reason: CloseReason): Promise<void> {
    const entry = this.#entries.get(uri)
    this.#entries.delete(uri)
    if (entry !== undefined) {
      await this.#close(uri, entry, reason)
    }
  }

  async releaseConnection(connectionId: string): Promise<void> {
    const uris = [...this.#entries].flatMap(([uri, entry]) =>
      entry.connection.id === connectionId ? [uri] : [],
    )
    await Promise.all(uris.map(async (uri) => this.release(uri, CloseReason.ConnectionClosed)))
  }

  async releaseAll(): Promise<void> {
    await Promise.all(
      [...this.#entries.keys()].map(async (uri) => this.release(uri, CloseReason.Shutdown)),
    )
  }

  dispose(): void {
    void this.releaseAll()
  }

  async #open(uri: string, connection: ConnectionConfig, scope: ObjectScope): Promise<Session> {
    const onLost = (error: Error): void => {
      this.#lose(uri, entry, error)
    }
    const entry: Entry = { connection, session: this.#connect({ connection, scope, onLost }) }
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

  async #connect({ connection, scope, onLost }: Opening): Promise<Session> {
    const database = scope.database === '' ? connection.database : scope.database
    const session = await this.#dependencies.open({
      connection: { ...connection, database },
      secrets: await this.#dependencies.readSecrets(connection),
      onUnexpectedClose: onLost,
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
    if (this.#scopes.get(uri) === key) {
      return
    }
    if (this.#dependencies.lifecycle.isPinned(uri)) {
      throw new Error(PINNED)
    }
    await session.engineSession.useScope(scope)
    this.#scopes.set(uri, key)
  }

  // The session ended by itself (the server, the network, or a cancel the server did not answer in
  // time): the next statement opens another one, the user hears what became of its transaction, and
  // what is left of it (an SSH tunnel, the connections to other databases) closes. A session the
  // editor already left changes nothing.
  #lose(uri: string, entry: Entry, error: Error): void {
    this.#dependencies.log.warn(`The connection of ${uri} ended: ${describeError(error)}`)
    if (this.#entries.get(uri) === entry) {
      this.#entries.delete(uri)
      this.#dependencies.lifecycle.onLost(uri)
    }
    void this.#closeLost(entry)
  }

  async #closeLost(entry: Entry): Promise<void> {
    try {
      await (await entry.session).close()
    } catch (error) {
      this.#dependencies.log.warn(
        `Could not close an editor connection that ended: ${describeError(error)}`,
      )
    }
  }

  // Closing is best effort: what fails is logged.
  async #close(uri: string, entry: Entry, reason: CloseReason): Promise<void> {
    try {
      const session = await entry.session
      await this.#dependencies.lifecycle.beforeClose(uri, session.engineSession, reason)
      await session.close()
    } catch (error) {
      this.#dependencies.log.warn(`Could not close an editor connection: ${describeError(error)}`)
    }
  }
}

function isSameSession(opened: ConnectionConfig, current: ConnectionConfig): boolean {
  return opened.id === current.id && !changesSession(opened, current)
}
