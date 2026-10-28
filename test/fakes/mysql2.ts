// Test double of the mysql2 client library: its connections answer from a script instead of a MySQL
// server, the external boundary of the MySQL driver. Unit tests mock 'mysql2' with createConnection
// below; the integration tests run the driver against a real server.
import { EventEmitter } from 'node:events'

import type { ConnectionOptions } from 'mysql2'
import { expect, vi } from 'vitest'

import type { ConnectRequest } from '../../src/core/engine/engine.ts'

export interface ScriptedQuery {
  readonly sql: string
  readonly values: readonly unknown[]
  // Sent with execute(): a prepared statement.
  readonly isPrepared?: boolean
}

export interface Answer {
  readonly error?: Error
  readonly result?: unknown
  // The answer waits for this promise, like a slow server.
  readonly after?: Promise<unknown>
}

export interface MysqlScript {
  connectError?: Error | undefined
  // The connect answers once this promise settles, like a server slow to answer (or never).
  connectAfter?: Promise<unknown> | undefined
  // Dials through the stream of the options as the connection is created, as mysql2 does: for the
  // tests that give it a local server to reach.
  shouldDial?: boolean
  pingError?: Error | undefined
  endError?: Error | undefined
  // Answers the statements sent with a callback: catalog queries, the version, KILL QUERY.
  answer: (query: ScriptedQuery) => Answer
  // Plays the events of a streamed statement on `events`.
  stream: (query: ScriptedQuery, events: EventEmitter) => void
}

type Callback = (error: unknown, result?: unknown) => void

const THREAD_ID = 42

export class FakeMysqlConnection extends EventEmitter {
  readonly threadId = THREAD_ID
  readonly options: ConnectionOptions
  readonly queries: ScriptedQuery[] = []
  isDestroyed = false
  isEnded = false

  constructor(options: ConnectionOptions) {
    super()
    this.options = options
  }

  connect(callback: Callback): void {
    void (mysql.script.connectAfter ?? Promise.resolve()).then(() => {
      setImmediate(() => {
        callback(mysql.script.connectError ?? null)
      })
    })
  }

  query(options: { sql: string; values?: unknown[] }, callback?: Callback): EventEmitter {
    const query = { sql: options.sql, values: options.values ?? [] }
    this.queries.push(query)
    const events = new EventEmitter()
    setImmediate(() => {
      if (callback === undefined) {
        mysql.script.stream(query, events)
        return
      }
      const { error, result, after = Promise.resolve() } = mysql.script.answer(query)
      void after.then(() => {
        callback(error ?? null, result)
      })
    })
    return events
  }

  // Prepared statements stream their rows like queries.
  execute(options: { sql: string; values?: unknown[] }): EventEmitter {
    const query = { sql: options.sql, values: options.values ?? [], isPrepared: true }
    this.queries.push(query)
    const events = new EventEmitter()
    setImmediate(() => {
      mysql.script.stream(query, events)
    })
    return events
  }

  // Like mysql2, a successful ping calls back with no argument at all.
  ping(callback: Callback): void {
    setImmediate(() => {
      const error = mysql.script.pingError
      if (error === undefined) {
        callback(undefined)
        return
      }
      callback(error)
    })
  }

  end(callback: Callback): void {
    this.isEnded = true
    setImmediate(() => {
      callback(mysql.script.endError ?? null)
    })
  }

  destroy(): void {
    this.isDestroyed = true
  }
}

// Streamed statements wait here until the test plays their events.
const streams: EventEmitter[] = []

function defaultScript(): MysqlScript {
  return {
    answer: () => ({ result: [] }),
    stream: (...[, events]) => {
      streams.push(events)
    },
  }
}

export const mysql = {
  script: defaultScript(),
  connections: [] as FakeMysqlConnection[],
  reset(): void {
    this.script = defaultScript()
    this.connections = []
    streams.length = 0
  },
}

// Answers each statement by the start of its SQL; the version query always answers 8.4.11.
export function answerBy(answers: readonly (readonly [string, Answer])[] = []): void {
  const table = new Map<string, Answer>([
    ['SELECT VERSION()', { result: [{ version: '8.4.11' }] }],
    ...answers,
  ])
  mysql.script.answer = (query) => {
    const start = [...table.keys()].find((prefix) => query.sql.trimStart().startsWith(prefix))
    return (start === undefined ? undefined : table.get(start)) ?? { result: [] }
  }
}

export async function nextStream(): Promise<EventEmitter> {
  await vi.waitFor(() => {
    expect(streams.length).toBeGreaterThan(0)
  })
  const events = streams.at(0)
  if (events === undefined) {
    throw new Error('no streamed statement')
  }
  return events
}

export function mysqlRequest(changes: Partial<ConnectRequest> = {}): ConnectRequest {
  return {
    endpoint: { host: '127.0.0.1', port: 3306 },
    user: 'app',
    password: 's3cret',
    database: 'shop',
    tls: undefined,
    isReadOnly: false,
    onUnexpectedClose: vi.fn(),
    ...changes,
  }
}

export function createConnection(options: ConnectionOptions): FakeMysqlConnection {
  const connection = new FakeMysqlConnection(options)
  if (mysql.script.shouldDial === true) {
    ;(options.stream as () => unknown)()
  }
  mysql.connections.push(connection)
  return connection
}
