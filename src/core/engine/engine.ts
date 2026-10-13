import type {
  CatalogDetail,
  ColumnInfo,
  DatabaseInfo,
  ForeignKeyInfo,
  IndexInfo,
  ObjectKind,
  ObjectRef,
  ObjectScope,
  ReferenceInfo,
  SchemaInfo,
  TableInfo,
  ViewInfo,
} from './catalog.ts'
import type { Dialect } from './dialect.ts'
import type { QueryExecution, QueryRequest } from './query.ts'
import type { TableDescription } from './table.ts'
import type { TransactionStatus } from './transaction-status.ts'

export interface Endpoint {
  readonly host: string
  readonly port: number
}

export interface TlsSettings {
  // The database host name: certificates are checked against it even when the connection goes
  // through a tunnel that listens on a local address.
  readonly serverName: string
  readonly shouldVerifyCertificate: boolean
  readonly shouldVerifyHostname: boolean
  readonly ca: string | undefined
  readonly cert: string | undefined
  readonly key: string | undefined
}

export interface ConnectRequest {
  // Where to dial: the database itself or the local end of a tunnel.
  readonly endpoint: Endpoint
  readonly user: string
  readonly password: string
  // Empty for the default database of the engine.
  readonly database: string
  readonly tls: TlsSettings | undefined
  // The session refuses to write whatever it is asked to run (read-only transactions): the layer
  // under the statement checks, for what they miss.
  readonly isReadOnly: boolean
  // Called at most once, when the server or the network ends the session without close().
  readonly onUnexpectedClose: (error: Error) => void
}

// What the connection form and the validation of a connection know of an engine.
export interface EngineOption {
  readonly id: string
  readonly displayName: string
  readonly defaultPort: number
}

export interface EngineDescriptor extends EngineOption {
  readonly urlSchemes: readonly string[]
  readonly dialect: Dialect
}

export interface Engine extends EngineDescriptor {
  readonly connect: (request: ConnectRequest) => Promise<EngineSession>
}

export interface EngineSession {
  readonly serverVersion: string
  readonly ping: () => Promise<void>
  readonly close: () => Promise<void>
  // With CatalogDetail.Statistics, in the same query: the size of each database, when the user may
  // see it.
  readonly listDatabases: (detail: CatalogDetail) => Promise<readonly DatabaseInfo[]>
  readonly listSchemas: (database: string) => Promise<readonly SchemaInfo[]>
  // With CatalogDetail.Statistics, in the same query: the estimated rows and the size of each table.
  readonly listTables: (scope: ObjectScope, detail: CatalogDetail) => Promise<readonly TableInfo[]>
  readonly listViews: (scope: ObjectScope) => Promise<readonly ViewInfo[]>
  readonly listColumns: (object: ObjectRef) => Promise<readonly ColumnInfo[]>
  readonly listIndexes: (table: ObjectRef) => Promise<readonly IndexInfo[]>
  readonly listForeignKeys: (table: ObjectRef) => Promise<readonly ForeignKeyInfo[]>
  // The foreign keys of other tables (of any schema of its database) that point at the table.
  readonly listReferences: (table: ObjectRef) => Promise<readonly ReferenceInfo[]>
  // The CREATE statement of a table or a view, as the server shows it or rebuilt from the catalog.
  readonly objectDdl: (object: ObjectRef, kind: ObjectKind) => Promise<string>
  // Makes later statements run in this database and schema (USE, search_path): unqualified names
  // resolve there.
  readonly useScope: (scope: ObjectScope) => Promise<void>
  readonly execute: (request: QueryRequest) => QueryExecution
  // Asks the server whether the session is in a transaction, after the statements before it ended.
  readonly transactionStatus: () => Promise<TransactionStatus>
  // The table result columns come from (ColumnOrigin.table), as editing needs it, read from the
  // catalog of a database of the session (empty: its own); undefined when the server does not know it.
  readonly describeTable: (
    database: string,
    table: readonly string[],
  ) => Promise<TableDescription | undefined>
  // The same, for a table named by where it is (a table a navigation leads to before any of its
  // rows were read); undefined when there is no such table.
  readonly describeTableAt: (table: ObjectRef) => Promise<TableDescription | undefined>
  // Makes the session refuse the values its columns cannot hold instead of changing them (MySQL
  // outside strict mode cuts or rounds them), for sqldoro's own writes, and returns what puts the
  // session back as it was: the user's statements keep their settings. Nothing changes on the
  // server, nor in other sessions.
  readonly startStrictWrites: () => Promise<RestoreSession>
}

// Puts a session back as it was before startStrictWrites.
export type RestoreSession = () => Promise<void>
