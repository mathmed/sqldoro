import type { Client } from 'pg'

import { ConnectionWatch } from '../../core/engine/connection-watch.ts'
import type { ConnectRequest, Engine, EngineSession } from '../../core/engine/engine.ts'
import { readNumber, readString } from '../../core/json/record.ts'
import {
  listColumns,
  listDatabases,
  listForeignKeys,
  listIndexes,
  listSchemas,
  listTables,
  listViews,
  queryRows,
} from './postgres-catalog.ts'
import { clientConfig, closeClient, openClient } from './postgres-connection.ts'
import { executeQuery } from './postgres-query.ts'

const DEFAULT_PORT = 5432
const SESSION_INFO = `SELECT current_setting('server_version') AS version, pg_backend_pid() AS pid,
  current_database() AS database`
const CANCEL = 'SELECT pg_cancel_backend($1)'

interface SessionInfo {
  readonly version: string
  readonly pid: number
  readonly database: string
}

export const postgresEngine: Engine = {
  id: 'postgres',
  displayName: 'PostgreSQL',
  defaultPort: DEFAULT_PORT,
  urlSchemes: ['postgres', 'postgresql'],
  dialect: { identifierQuote: '"', hasSchemas: true },
  connect: connectPostgres,
}

// A PostgreSQL connection is bound to one database: browsing another one opens its own connection,
// on first use, kept until the session closes.
class Clients {
  readonly #clients = new Map<string, Promise<Client>>()
  readonly #request: ConnectRequest
  readonly #watch: ConnectionWatch

  constructor(request: ConnectRequest, watch: ConnectionWatch) {
    this.#request = request
    this.#watch = watch
  }

  add(database: string, client: Client): void {
    this.#clients.set(database, Promise.resolve(client))
  }

  async of(database: string): Promise<Client> {
    const existing = this.#clients.get(database)
    if (existing !== undefined) {
      return existing
    }
    const opening = openClient(clientConfig(this.#request, database), this.#watch.report).catch(
      (error: unknown) => {
        this.#clients.delete(database)
        throw error
      },
    )
    this.#clients.set(database, opening)
    return opening
  }

  async closeAll(): Promise<void> {
    const opened = await Promise.allSettled(this.#clients.values())
    this.#clients.clear()
    const clients = opened.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    )
    await Promise.all(clients.map(closeClient))
  }
}

async function connectPostgres(request: ConnectRequest): Promise<EngineSession> {
  const watch = new ConnectionWatch(request.onUnexpectedClose)
  const client = await openClient(clientConfig(request, request.database), watch.report)
  try {
    const info = await sessionInfo(client)
    const clients = new Clients(request, watch)
    clients.add(info.database, client)
    return createSession({ client, clients, request, watch }, info)
  } catch (error) {
    watch.close()
    await Promise.allSettled([closeClient(client)])
    throw error
  }
}

async function sessionInfo(client: Client): Promise<SessionInfo> {
  const [row] = await queryRows(client, SESSION_INFO, [])
  if (row === undefined) {
    throw new TypeError('PostgreSQL did not describe the session')
  }
  return {
    version: readString(row, 'version'),
    pid: readNumber(row, 'pid'),
    database: readString(row, 'database'),
  }
}

interface SessionParts {
  readonly client: Client
  readonly clients: Clients
  readonly request: ConnectRequest
  readonly watch: ConnectionWatch
}

function createSession(parts: SessionParts, info: SessionInfo): EngineSession {
  const { client, clients, request, watch } = parts
  return {
    serverVersion: info.version,
    ping: async () => {
      await client.query('SELECT 1')
    },
    close: async () => {
      watch.close()
      await clients.closeAll()
    },
    listDatabases: async () => listDatabases(client),
    listSchemas: async (database) => listSchemas(await clients.of(database)),
    listTables: async (scope) => listTables(await clients.of(scope.database), scope),
    listViews: async (scope) => listViews(await clients.of(scope.database), scope),
    listColumns: async (object) => listColumns(await clients.of(object.database), object),
    listIndexes: async (table) => listIndexes(await clients.of(table.database), table),
    listForeignKeys: async (table) => listForeignKeys(await clients.of(table.database), table),
    execute: (query) =>
      executeQuery({ client, cancel: async () => cancelBackend(request, info) }, query),
  }
}

// The cancel request comes from another connection: the session's own is busy with the statement.
async function cancelBackend(request: ConnectRequest, info: SessionInfo): Promise<void> {
  let failure: Error | undefined
  const client = await openClient(clientConfig(request, info.database), (error) => {
    failure = error
  })
  try {
    await client.query(CANCEL, [info.pid])
  } finally {
    await closeClient(client)
  }
  if (failure !== undefined) {
    throw failure
  }
}
