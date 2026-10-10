import type { Connection } from 'mysql2'

import { ConnectionWatch } from '../../core/engine/connection-watch.ts'
import type { ConnectRequest, Engine, EngineSession } from '../../core/engine/engine.ts'
import { readString } from '../../core/json/record.ts'
import {
  listColumns,
  listDatabases,
  listForeignKeys,
  listIndexes,
  listTables,
  listViews,
  queryRows,
  runQuery,
} from './mysql-catalog.ts'
import { closeConnection, openConnection } from './mysql-connection.ts'
import { objectDdl, useDatabase } from './mysql-ddl.ts'
import { MYSQL_DIALECT } from './mysql-dialect.ts'
import { executeQuery, type QueryTarget } from './mysql-query.ts'

const DEFAULT_PORT = 3306
const VERSION = 'SELECT VERSION() AS version'
const KILL_QUERY = 'KILL QUERY ?'

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
  const connection = await openConnection(request, watch.report)
  try {
    const [row] = await queryRows(connection, VERSION, [])
    return createSession(
      { connection, request, watch },
      row === undefined ? '' : readString(row, 'version'),
    )
  } catch (error) {
    watch.close()
    connection.destroy()
    throw error
  }
}

interface SessionParts {
  readonly connection: Connection
  readonly request: ConnectRequest
  readonly watch: ConnectionWatch
}

function createSession(
  { connection, request, watch }: SessionParts,
  serverVersion: string,
): EngineSession {
  const target: QueryTarget = {
    connection,
    kill: async () => killQuery(request, connection.threadId),
    onConnectionLost: watch.listen,
  }
  return {
    serverVersion,
    ping: async () => ping(connection),
    close: async () => {
      watch.close()
      await closeConnection(connection)
    },
    listDatabases: async () => listDatabases(connection),
    listSchemas: async () => Promise.resolve([]),
    listTables: async (scope) => listTables(connection, scope),
    listViews: async (scope) => listViews(connection, scope),
    listColumns: async (object) => listColumns(connection, object),
    listIndexes: async (table) => listIndexes(connection, table),
    listForeignKeys: async (table) => listForeignKeys(connection, table),
    objectDdl: async (object, kind) => objectDdl(connection, object, kind),
    useScope: async (scope) => useDatabase(connection, scope.database),
    execute: (query) => executeQuery(target, query),
  }
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

// KILL QUERY must come from another connection: the session's own is busy with the statement.
async function killQuery(request: ConnectRequest, threadId: number): Promise<void> {
  let failure: Error | undefined
  const connection = await openConnection(request, (error) => {
    failure = error
  })
  try {
    await runQuery(connection, KILL_QUERY, [threadId])
  } finally {
    await closeConnection(connection)
  }
  if (failure !== undefined) {
    throw failure
  }
}
