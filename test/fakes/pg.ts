// Test double of the pg and pg-cursor client libraries: clients and cursors answer from a script
// instead of a PostgreSQL server, the external boundary of the PostgreSQL driver. Unit tests mock
// 'pg' with FakeClient and 'pg-cursor' with FakeCursor; the integration tests use a real server.
import { EventEmitter } from 'node:events'

import type { ClientConfig, FieldDef, QueryResult } from 'pg'
import { vi } from 'vitest'

import type { ConnectRequest } from '../../src/core/engine/engine.ts'

export interface ScriptedQuery {
  readonly sql: string
  readonly values: readonly unknown[]
}

export interface Answer {
  readonly error?: Error
  readonly rows?: readonly Record<string, unknown>[]
  // The answer waits for this promise, like a slow server.
  readonly after?: Promise<unknown>
}

export interface Page {
  readonly error?: Error
  // The page comes once this promise settles, like a server slow to answer (or never).
  readonly after?: Promise<unknown>
  readonly rows?: readonly unknown[]
  readonly command?: string
  readonly rowCount?: number | null
  // Computed values unless they name the relation and the column they come from.
  readonly fields?: readonly (Pick<FieldDef, 'dataTypeID' | 'name'> &
    Partial<Pick<FieldDef, 'columnID' | 'tableID'>>)[]
}

export interface PgScript {
  connectError?: Error | undefined
  // The connect answers once this promise settles, like a server slow to answer (or never).
  connectAfter?: Promise<unknown> | undefined
  // Closing a cursor ends once this promise settles: pg waits for the server to answer it.
  closeAfter?: Promise<unknown> | undefined
  endError?: Error | undefined
  // What getTransactionStatus() answers: I (idle), T (in a transaction), E (failed) or null.
  transactionStatus?: string | null
  answer: (query: ScriptedQuery, client: FakeClient) => Answer
  read: (cursor: FakeCursor, size: number) => Page
}

type ReadCallback = (error: Error | undefined, rows: unknown[], result: QueryResult) => void

export class FakeCursor {
  readonly sql: string
  readonly values: unknown
  readonly config: unknown
  readonly reads: number[] = []
  isClosed = false

  constructor(...[sql, values, config]: [string, unknown, unknown]) {
    this.sql = sql
    this.values = values
    this.config = config
  }

  read(size: number, callback: ReadCallback): void {
    this.reads.push(size)
    setImmediate(() => {
      const page = pg.script.read(this, size)
      const result = {
        command: page.command ?? 'SELECT',
        rowCount: page.rowCount ?? null,
        oid: 0,
        fields: (page.fields ?? []).map((field) => ({ tableID: 0, columnID: 0, ...field })),
        rows: [],
      } as unknown as QueryResult
      void (page.after ?? Promise.resolve()).then(() => {
        callback(page.error, [...(page.rows ?? [])], result)
      })
    })
  }

  async close(): Promise<void> {
    this.isClosed = true
    await pg.script.closeAfter
  }
}

export class FakeClient extends EventEmitter {
  readonly config: ClientConfig
  readonly queries: ScriptedQuery[] = []
  readonly cursors: FakeCursor[] = []
  isEnded = false
  isDestroyed = false
  // The connection of pg under the client: its socket goes when the client is dropped.
  readonly connection = {
    stream: {
      destroy: (): void => {
        this.isDestroyed = true
      },
    },
  }

  constructor(config: ClientConfig) {
    super()
    this.config = config
    pg.clients.push(this)
  }

  async connect(): Promise<void> {
    await pg.script.connectAfter
    const error = pg.script.connectError
    return error === undefined ? Promise.resolve() : Promise.reject(error)
  }

  query(
    statement: FakeCursor | string,
    values: unknown[] = [],
  ): FakeCursor | Promise<{ rows: readonly Record<string, unknown>[] }> {
    if (statement instanceof FakeCursor) {
      this.cursors.push(statement)
      return statement
    }
    const query = { sql: statement, values }
    this.queries.push(query)
    const { error, rows = [], after = Promise.resolve() } = pg.script.answer(query, this)
    return after.then(async () => (error === undefined ? { rows } : Promise.reject(error)))
  }

  getTransactionStatus(): string | null {
    return pg.script.transactionStatus === undefined ? 'I' : pg.script.transactionStatus
  }

  async end(): Promise<void> {
    this.isEnded = true
    const error = pg.script.endError
    return error === undefined ? Promise.resolve() : Promise.reject(error)
  }
}

const SESSION_INFO = { version: '18.6', pid: 4242, database: 'shop' }
// The OID PostgreSQL gives int4, the type of the rows serveRows serves.
const INT4 = 23
export const NUMBERS = [{ name: 'n', dataTypeID: INT4 }]

function defaultScript(): PgScript {
  return {
    answer: (query) =>
      query.sql.includes('pg_backend_pid()') ? { rows: [SESSION_INFO] } : { rows: [] },
    read: () => ({}),
  }
}

export const pg = {
  script: defaultScript(),
  clients: [] as FakeClient[],
  reset(): void {
    this.script = defaultScript()
    this.clients = []
  },
}

// Answers each statement by the start of its SQL, after the description of the session.
export function answerBy(answers: readonly (readonly [string, Answer])[]): void {
  const table = new Map(answers)
  const fallback = defaultScript().answer
  pg.script.answer = (query, client) => {
    const start = [...table.keys()].find((prefix) => query.sql.trimStart().startsWith(prefix))
    return (start === undefined ? undefined : table.get(start)) ?? fallback(query, client)
  }
}

export function pgRequest(changes: Partial<ConnectRequest> = {}): ConnectRequest {
  return {
    endpoint: { host: '127.0.0.1', port: 5432 },
    user: 'app',
    password: 's3cret',
    database: 'shop',
    tls: undefined,
    isReadOnly: false,
    onUnexpectedClose: vi.fn(),
    ...changes,
  }
}

// Serves `total` numbered rows to whatever reads the cursor.
export function serveRows(total: number, page: Partial<Page> = {}): void {
  let served = 0
  pg.script.read = (...[, size]) => {
    const count = Math.min(size, total - served)
    const rows = Array.from({ length: count }, (...[, index]) => [served + index + 1])
    served += rows.length
    return { fields: NUMBERS, rows, ...page }
  }
}

// The first cursor the first client opened: the statement of the session.
export function firstCursor(): FakeCursor {
  const found = pg.clients[0]?.cursors[0]
  if (found === undefined) {
    throw new Error('no cursor was opened')
  }
  return found
}
