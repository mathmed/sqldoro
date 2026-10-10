import type {
  ColumnInfo,
  DatabaseInfo,
  ForeignKeyInfo,
  IndexInfo,
  ObjectKind,
  ObjectRef,
  ObjectScope,
  SchemaInfo,
  TableInfo,
  ViewInfo,
} from './catalog.ts'
import type { Dialect } from './dialect.ts'
import type { QueryExecution, QueryRequest } from './query.ts'

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
  // Called at most once, when the server or the network ends the session without close().
  readonly onUnexpectedClose: (error: Error) => void
}

export interface EngineDescriptor {
  readonly id: string
  readonly displayName: string
  readonly defaultPort: number
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
  readonly listDatabases: () => Promise<readonly DatabaseInfo[]>
  readonly listSchemas: (database: string) => Promise<readonly SchemaInfo[]>
  readonly listTables: (scope: ObjectScope) => Promise<readonly TableInfo[]>
  readonly listViews: (scope: ObjectScope) => Promise<readonly ViewInfo[]>
  readonly listColumns: (object: ObjectRef) => Promise<readonly ColumnInfo[]>
  readonly listIndexes: (table: ObjectRef) => Promise<readonly IndexInfo[]>
  readonly listForeignKeys: (table: ObjectRef) => Promise<readonly ForeignKeyInfo[]>
  // The CREATE statement of a table or a view, as the server shows it or rebuilt from the catalog.
  readonly objectDdl: (object: ObjectRef, kind: ObjectKind) => Promise<string>
  // Makes later statements run in this database and schema (USE, search_path): unqualified names
  // resolve there.
  readonly useScope: (scope: ObjectScope) => Promise<void>
  readonly execute: (request: QueryRequest) => QueryExecution
}
