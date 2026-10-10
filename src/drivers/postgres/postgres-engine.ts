import type { Client } from 'pg'

import type { ObjectScope } from '../../core/engine/catalog.ts'
import { ConnectionWatch } from '../../core/engine/connection-watch.ts'
import { quoteIdentifier } from '../../core/engine/dialect.ts'
import type { ConnectRequest, Engine, EngineSession } from '../../core/engine/engine.ts'
import type { QueryExecution, QueryRequest } from '../../core/engine/query.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
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
import { objectDdl } from './postgres-ddl.ts'
import { POSTGRES_DIALECT } from './postgres-dialect.ts'
import { executeQuery } from './postgres-query.ts'
import { describeTable } from './postgres-tables.ts'

const DEFAULT_PORT = 5432
const SESSION_INFO = `SELECT current_setting('server_version') AS version, pg_backend_pid() AS pid,
  current_database() AS database`
const BACKEND_PID = 'SELECT pg_backend_pid() AS pid'
const CANCEL = 'SELECT pg_cancel_backend($1)'
const RESET_SEARCH_PATH = 'RESET search_path'
// Every transaction of the connection is read-only: the server refuses writes whatever the statement.
const READ_ONLY_SESSION = 'SET default_transaction_read_only = on'
// An empty query: once it is answered, the client knows the transaction status of the statements
// before it, failed ones included.
const STATUS_PROBE = ''
const TRANSACTION_STATUSES: ReadonlyMap<string, TransactionStatus> = new Map([
  ['I', TransactionStatus.Idle],
  ['T', TransactionStatus.Open],
  ['E', TransactionStatus.Failed],
])
// Objects of public (extensions, shared functions) stay reachable from another schema.
const PUBLIC_SCHEMA = 'public'

// A connection of the session to one database, with the backend that serves it.
interface DatabaseClient {
  readonly client: Client
  readonly pid: number
  readonly database: string
}

export const postgresEngine: Engine = {
  id: 'postgres',
  displayName: 'PostgreSQL',
  defaultPort: DEFAULT_PORT,
  urlSchemes: ['postgres', 'postgresql'],
  dialect: POSTGRES_DIALECT,
  connect: connectPostgres,
}

// A PostgreSQL connection is bound to one database: another database gets its own connection, on
// first use, kept until the session closes. Statements run on the current one, which useScope
// chooses.
class Clients {
  readonly #clients = new Map<string, Promise<DatabaseClient>>()
  readonly #request: ConnectRequest
  readonly #watch: ConnectionWatch
  #current: DatabaseClient

  constructor(request: ConnectRequest, watch: ConnectionWatch, main: DatabaseClient) {
    this.#request = request
    this.#watch = watch
    this.#current = main
  }

  add(opened: DatabaseClient): void {
    this.#clients.set(opened.database, Promise.resolve(opened))
  }

  get current(): DatabaseClient {
    return this.#current
  }

  async use(scope: ObjectScope): Promise<void> {
    const target = await this.in(scope.database)
    await setSearchPath(target.client, scope.schema)
    this.#current = target
  }

  // The connection to a database; an empty name is the database the session opened in.
  async in(database: string): Promise<DatabaseClient> {
    return this.of(database === '' ? this.#request.database : database)
  }

  async of(database: string): Promise<DatabaseClient> {
    const existing = this.#clients.get(database)
    if (existing !== undefined) {
      return existing
    }
    const opening = this.#open(database).catch((error: unknown) => {
      this.#clients.delete(database)
      throw error
    })
    this.#clients.set(database, opening)
    return opening
  }

  async closeAll(): Promise<void> {
    const opened = await Promise.allSettled(this.#clients.values())
    this.#clients.clear()
    const clients = opened.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value.client] : [],
    )
    await Promise.all(clients.map(closeClient))
  }

  async #open(database: string): Promise<DatabaseClient> {
    const client = await openClient(clientConfig(this.#request, database), this.#watch.report)
    try {
      await restrictSession(client, this.#request)
      const [row] = await queryRows(client, BACKEND_PID, [])
      return { client, pid: row === undefined ? 0 : readNumber(row, 'pid'), database }
    } catch (error) {
      await Promise.allSettled([closeClient(client)])
      throw error
    }
  }
}

async function restrictSession(client: Client, request: ConnectRequest): Promise<void> {
  if (request.isReadOnly) {
    await client.query(READ_ONLY_SESSION)
  }
}

async function transactionStatusOf(client: Client): Promise<TransactionStatus> {
  await client.query(STATUS_PROBE)
  return TRANSACTION_STATUSES.get(client.getTransactionStatus() ?? '') ?? TransactionStatus.Unknown
}

// Unqualified names resolve in the schema first; an empty schema brings the default back.
async function setSearchPath(client: Client, schema: string): Promise<void> {
  if (schema === '') {
    await client.query(RESET_SEARCH_PATH)
    return
  }
  const schemas = schema === PUBLIC_SCHEMA ? [schema] : [schema, PUBLIC_SCHEMA]
  const path = schemas.map((name) => quoteIdentifier(POSTGRES_DIALECT, name)).join(', ')
  await client.query(`SET search_path TO ${path}`)
}

async function connectPostgres(request: ConnectRequest): Promise<EngineSession> {
  const watch = new ConnectionWatch(request.onUnexpectedClose)
  const client = await openClient(clientConfig(request, request.database), watch.report)
  try {
    await restrictSession(client, request)
    const [row] = await queryRows(client, SESSION_INFO, [])
    if (row === undefined) {
      throw new TypeError('PostgreSQL did not describe the session')
    }
    const main = { client, pid: readNumber(row, 'pid'), database: readString(row, 'database') }
    const clients = new Clients({ ...request, database: main.database }, watch, main)
    clients.add(main)
    return createSession({ clients, request, watch }, readString(row, 'version'))
  } catch (error) {
    watch.close()
    await Promise.allSettled([closeClient(client)])
    throw error
  }
}

interface SessionParts {
  readonly clients: Clients
  readonly request: ConnectRequest
  readonly watch: ConnectionWatch
}

function createSession({ clients, request, watch }: SessionParts, version: string): EngineSession {
  const { client } = clients.current
  const of = async (database: string): Promise<Client> => (await clients.of(database)).client
  return {
    serverVersion: version,
    ping: async () => {
      await client.query('SELECT 1')
    },
    close: async () => {
      watch.close()
      await clients.closeAll()
    },
    listDatabases: async () => listDatabases(client),
    listSchemas: async (database) => listSchemas(await of(database)),
    listTables: async (scope) => listTables(await of(scope.database), scope),
    listViews: async (scope) => listViews(await of(scope.database), scope),
    listColumns: async (object) => listColumns(await of(object.database), object),
    listIndexes: async (table) => listIndexes(await of(table.database), table),
    listForeignKeys: async (table) => listForeignKeys(await of(table.database), table),
    objectDdl: async (object, kind) => objectDdl(await of(object.database), object, kind),
    useScope: async (scope) => clients.use(scope),
    execute: (query) => executeOn(clients.current, request, query),
    transactionStatus: async () => transactionStatusOf(clients.current.client),
    describeTable: async (database, table) => describeTable(await clients.in(database), table),
    // PostgreSQL refuses a value its column cannot hold.
    writeProblem: async () => Promise.resolve(undefined),
  }
}

function executeOn(
  target: DatabaseClient,
  request: ConnectRequest,
  query: QueryRequest,
): QueryExecution {
  return executeQuery(
    { client: target.client, cancel: async () => cancelBackend(request, target) },
    query,
  )
}

// The cancel request comes from another connection: the session's own is busy with the statement.
async function cancelBackend(request: ConnectRequest, target: DatabaseClient): Promise<void> {
  let failure: Error | undefined
  const client = await openClient(clientConfig(request, target.database), (error) => {
    failure = error
  })
  try {
    await client.query(CANCEL, [target.pid])
  } finally {
    await closeClient(client)
  }
  if (failure !== undefined) {
    throw failure
  }
}
