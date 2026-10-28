import type { Connection } from 'mysql2'

import { untilDeadline } from '../../core/engine/cancellation.ts'
import { ConnectionWatch } from '../../core/engine/connection-watch.ts'
import type { ConnectRequest, Engine, EngineSession } from '../../core/engine/engine.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { readString } from '../../core/json/record.ts'
import {
  listColumns,
  listDatabases,
  listForeignKeys,
  listIndexes,
  listReferences,
  listTables,
  listViews,
  queryRows,
  runQuery,
} from './mysql-catalog.ts'
import {
  closeConnection,
  type MysqlLink,
  openConnection,
  startConnection,
} from './mysql-connection.ts'
import { objectDdl, useDatabase } from './mysql-ddl.ts'
import { MYSQL_DIALECT } from './mysql-dialect.ts'
import { executeQuery, type QueryTarget } from './mysql-query.ts'
import { startStrictWrites } from './mysql-strict-writes.ts'
import { describeTable } from './mysql-tables.ts'

const DEFAULT_PORT = 3306
const VERSION = 'SELECT VERSION() AS version'
const KILL_QUERY = 'KILL QUERY ?'
// Every transaction of the session is read-only: the server refuses writes whatever the statement.
const READ_ONLY_SESSION = 'SET SESSION TRANSACTION READ ONLY'
// A statement that does nothing and answers with an OK packet, whose status tells whether the
// session is in a transaction.
const STATUS_PROBE = 'DO 0'
const SERVER_STATUS_IN_TRANS = 1

export const mysqlEngine: Engine = {
  id: 'mysql',
  displayName: 'MySQL',
  defaultPort: DEFAULT_PORT,
  urlSchemes: ['mysql'],
  dialect: MYSQL_DIALECT,
  connect: connectMysql,
}

async function connectMysql(request: ConnectRequest): Promise<EngineSession> {
  const watch = new ConnectionWatch(request.onUnexpectedClose)
  const link = await openConnection(request, watch.report)
  try {
    const [row] = await queryRows(link.connection, VERSION, [])
    if (request.isReadOnly) {
      await runQuery(link.connection, READ_ONLY_SESSION, [])
    }
    return createSession(
      { link, request, watch },
      row === undefined ? '' : readString(row, 'version'),
    )
  } catch (error) {
    watch.close()
    link.drop()
    throw error
  }
}

interface SessionParts {
  readonly link: MysqlLink
  readonly request: ConnectRequest
  readonly watch: ConnectionWatch
}

function createSession(
  { link, request, watch }: SessionParts,
  serverVersion: string,
): EngineSession {
  const { connection } = link
  const target: QueryTarget = {
    connection,
    stopper: {
      kill: async (deadline) => killQuery(request, connection.threadId, deadline),
      // The server did not stop the statement in time: the session ends, and says why.
      drop: (reason) => {
        link.drop()
        watch.report(reason)
      },
    },
    onConnectionLost: watch.listen,
  }
  return {
    serverVersion,
    ping: async () => ping(connection),
    close: async () => {
      watch.close()
      await closeConnection(connection)
    },
    ...catalogOf(connection),
    useScope: async (scope) => useDatabase(connection, scope.database),
    execute: (query) => executeQuery(target, query),
    transactionStatus: async () => statusOf(await runQuery(connection, STATUS_PROBE, [])),
    startStrictWrites: async () => startStrictWrites(connection),
  }
}

type Catalog = Pick<
  EngineSession,
  | 'describeTable'
  | 'describeTableAt'
  | 'listColumns'
  | 'listDatabases'
  | 'listForeignKeys'
  | 'listIndexes'
  | 'listReferences'
  | 'listSchemas'
  | 'listTables'
  | 'listViews'
  | 'objectDdl'
>

// What the session reads from information_schema and SHOW CREATE.
function catalogOf(connection: Connection): Catalog {
  return {
    listDatabases: async (detail) => listDatabases(connection, detail),
    listSchemas: async () => Promise.resolve([]),
    listTables: async (scope, detail) => listTables(connection, scope, detail),
    listViews: async (scope) => listViews(connection, scope),
    listColumns: async (object) => listColumns(connection, object),
    listIndexes: async (table) => listIndexes(connection, table),
    listForeignKeys: async (table) => listForeignKeys(connection, table),
    listReferences: async (table) => listReferences(connection, table),
    objectDdl: async (object, kind) => objectDdl(connection, object, kind),
    // The table key names the database: MySQL reads any database's catalog from this connection.
    describeTable: async (...[, table]) => describeTable(connection, table),
    // In MySQL a table is named by its database (its schema) and its name, as result columns name it.
    describeTableAt: async (table) => describeTable(connection, [table.schema, table.name]),
  }
}

// The status flags of the OK packet the probe gets back.
export function statusOf(result: unknown): TransactionStatus {
  const flags = serverStatusOf(result)
  if (flags === undefined) {
    return TransactionStatus.Unknown
  }
  return (flags & SERVER_STATUS_IN_TRANS) === 0 ? TransactionStatus.Idle : TransactionStatus.Open
}

function serverStatusOf(result: unknown): number | undefined {
  if (typeof result !== 'object' || result === null || !('serverStatus' in result)) {
    return undefined
  }
  return typeof result.serverStatus === 'number' ? result.serverStatus : undefined
}

async function ping(connection: Connection): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<undefined>()
  // mysql2 reports a successful ping with no argument at all, not with null.
  connection.ping((error: unknown) => {
    if (error instanceof Error) {
      reject(error)
      return
    }
    resolve(undefined)
  })
  return promise
}

// KILL QUERY must come from another connection: the session's own is busy with the statement. The
// request ends by the deadline: past it, its connection is dropped wherever it was, connecting
// included.
async function killQuery(
  request: ConnectRequest,
  threadId: number,
  deadline: Promise<void>,
): Promise<void> {
  let failure: Error | undefined
  const { link, connected } = startConnection(request, (error) => {
    failure = error
  })
  await untilDeadline(killOn(link.connection, { connected, threadId }), deadline, link.drop)
  if (failure !== undefined) {
    throw failure
  }
}

interface Kill {
  readonly connected: Promise<void>
  readonly threadId: number
}

async function killOn(connection: Connection, { connected, threadId }: Kill): Promise<void> {
  await connected
  try {
    await runQuery(connection, KILL_QUERY, [threadId])
  } finally {
    await closeConnection(connection)
  }
}
