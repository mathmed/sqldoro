import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ConnectionSecrets } from '../../core/connection/secrets.ts'
import type { Logger } from '../../core/platform.ts'
import type { Session } from '../../core/session/open-session.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SessionOpener } from './session-opener.ts'

export const ConnectionStatus = {
  Disconnected: 'disconnected',
  Connecting: 'connecting',
  Connected: 'connected',
  Failed: 'failed',
} as const

export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus]

export type ConnectionState =
  | { readonly status: typeof ConnectionStatus.Connected; readonly serverVersion: string }
  | { readonly status: typeof ConnectionStatus.Connecting }
  | { readonly status: typeof ConnectionStatus.Disconnected }
  // Why the connection failed or was lost, for people.
  | { readonly status: typeof ConnectionStatus.Failed; readonly message: string }

export interface SessionManagerDependencies {
  readonly open: SessionOpener
  readonly readSecrets: (connection: ConnectionConfig) => Promise<ConnectionSecrets>
  readonly log: Logger
  readonly onConnectionLost: (connection: ConnectionConfig, message: string) => void
}

const DISCONNECTED: ConnectionState = { status: ConnectionStatus.Disconnected }

// The open sessions, one per connection at most: connecting twice shares the same attempt, and
// disconnecting twice closes once.
export class SessionManager {
  readonly #dependencies: SessionManagerDependencies
  readonly #sessions = new Map<string, Session>()
  readonly #pending = new Map<string, Promise<Session>>()
  readonly #states = new Map<string, ConnectionState>()
  readonly #changes = new vscode.EventEmitter<string>()
  readonly onDidChange = this.#changes.event

  constructor(dependencies: SessionManagerDependencies) {
    this.#dependencies = dependencies
  }

  state(id: string): ConnectionState {
    return this.#states.get(id) ?? DISCONNECTED
  }

  session(id: string): Session | undefined {
    return this.#sessions.get(id)
  }

  async connect(connection: ConnectionConfig): Promise<Session> {
    const existing = this.#sessions.get(connection.id) ?? this.#pending.get(connection.id)
    if (existing !== undefined) {
      return existing
    }
    const opening = this.#open(connection)
    this.#pending.set(connection.id, opening)
    try {
      return await opening
    } finally {
      this.#pending.delete(connection.id)
    }
  }

  async disconnect(id: string): Promise<void> {
    await this.#pending.get(id)?.catch(() => undefined)
    const session = this.#sessions.get(id)
    this.#sessions.delete(id)
    this.#setState(id, DISCONNECTED)
    if (session !== undefined) {
      await this.#close(session)
    }
  }

  async disconnectAll(): Promise<void> {
    const ids = new Set([...this.#sessions.keys(), ...this.#pending.keys()])
    await Promise.all([...ids].map(async (id) => this.disconnect(id)))
  }

  dispose(): void {
    this.#changes.dispose()
  }

  async #open(connection: ConnectionConfig): Promise<Session> {
    this.#setState(connection.id, { status: ConnectionStatus.Connecting })
    try {
      const session = await this.#dependencies.open({
        connection,
        secrets: await this.#dependencies.readSecrets(connection),
        onUnexpectedClose: (error) => {
          this.#lose(connection, error)
        },
      })
      this.#sessions.set(connection.id, session)
      const { serverVersion } = session.engineSession
      this.#setState(connection.id, {
        status: ConnectionStatus.Connected,
        serverVersion,
      })
      this.#dependencies.log.info(
        `Connected to ${connection.name} (${session.engine.displayName} ${serverVersion})`,
      )
      return session
    } catch (error) {
      const message = describeError(error)
      this.#setState(connection.id, { status: ConnectionStatus.Failed, message })
      this.#dependencies.log.error(`Could not connect to ${connection.name}: ${message}`)
      throw error
    }
  }

  #lose(connection: ConnectionConfig, error: Error): void {
    const session = this.#sessions.get(connection.id)
    if (session === undefined) {
      return
    }
    this.#sessions.delete(connection.id)
    const message = `Connection lost: ${describeError(error)}`
    this.#setState(connection.id, { status: ConnectionStatus.Failed, message })
    this.#dependencies.log.warn(`${connection.name}: ${message}`)
    this.#dependencies.onConnectionLost(connection, message)
    void this.#close(session)
  }

  // Closing is best effort: what fails is logged, and the session is gone either way.
  async #close(session: Session): Promise<void> {
    try {
      await session.close()
    } catch (error) {
      this.#dependencies.log.warn(`Could not close a session cleanly: ${describeError(error)}`)
    }
  }

  #setState(id: string, state: ConnectionState): void {
    this.#states.set(id, state)
    this.#changes.fire(id)
  }
}
