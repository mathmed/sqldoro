import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { CatalogDetail, type ObjectScope } from '../../core/engine/catalog.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { Logger } from '../../core/platform.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SchemaCache } from '../completion/schema-cache.ts'
import type { SessionManager } from '../sessions/session-manager.ts'

// The tables and views of a namespace (a schema, or a MySQL database).
export interface ScopeObjects {
  readonly scope: ObjectScope
  readonly tables: readonly string[]
  readonly views: readonly string[]
}

export interface ConnectionObjects {
  readonly connection: ConnectionConfig
  readonly scopes: readonly ScopeObjects[]
}

export interface TableIndexDependencies {
  readonly cache: Pick<SchemaCache, 'cached'>
  readonly connections: () => readonly ConnectionConfig[]
  readonly sessions: Pick<SessionManager, 'session'>
  readonly engines: EngineRegistry
  readonly log: Logger
}

// The namespaces of the server itself, which hold no table of the user's.
const SYSTEM_SCOPES: ReadonlySet<string> = new Set([
  'information_schema',
  'mysql',
  'performance_schema',
  'sys',
  'pg_catalog',
  'pg_toast',
])

// A PostgreSQL connection without a database of its own is searched in its first databases only:
// each database needs a connection of its own.
const MAX_POSTGRES_DATABASES = 10

// Every table and view of the connected connections, to find them by name: the lists load once,
// with the schema cache (so the autocomplete shares them, and a refresh of the explorer reads them
// again). A MySQL connection lists every database of its server; a PostgreSQL connection the
// schemas of the database it names.
export class TableIndex {
  readonly #dependencies: TableIndexDependencies

  constructor(dependencies: TableIndexDependencies) {
    this.#dependencies = dependencies
  }

  async objects(): Promise<readonly ConnectionObjects[]> {
    const connected = this.#dependencies.connections().flatMap((connection) => {
      const session = this.#dependencies.sessions.session(connection.id)?.engineSession
      return session === undefined ? [] : [{ connection, session }]
    })
    return Promise.all(connected.map(async (source) => this.#objectsOf(source)))
  }

  async #objectsOf(source: Source): Promise<ConnectionObjects> {
    try {
      const scopes = await this.#scopesOf(source)
      return {
        connection: source.connection,
        scopes: await Promise.all(scopes.map(async (scope) => this.#scopeObjects(source, scope))),
      }
    } catch (error) {
      this.#dependencies.log.warn(
        `Could not list the tables of "${source.connection.name}": ${describeError(error)}`,
      )
      return { connection: source.connection, scopes: [] }
    }
  }

  async #scopesOf(source: Source): Promise<ObjectScope[]> {
    const { dialect } = this.#dependencies.engines.get(source.connection.engine)
    const databases = await this.#databasesOf(source, dialect.hasSchemas)
    if (!dialect.hasSchemas) {
      return databases.map((name) => ({ database: name, schema: name })).filter(isUserScope)
    }
    const scopes = await Promise.all(
      databases.map(async (database) => this.#schemasOf(source, database)),
    )
    return scopes.flat().filter(isUserScope)
  }

  async #databasesOf({ connection, session }: Source, hasSchemas: boolean): Promise<string[]> {
    if (hasSchemas && connection.database !== '') {
      return [connection.database]
    }
    const databases = await this.#cached(connection, ['databases'], async () =>
      session.listDatabases(CatalogDetail.Names),
    )
    const names = databases.map(({ name }) => name)
    return hasSchemas ? names.slice(0, MAX_POSTGRES_DATABASES) : names
  }

  async #schemasOf({ connection, session }: Source, database: string): Promise<ObjectScope[]> {
    const schemas = await this.#cached(connection, ['schemas', database], async () =>
      session.listSchemas(database),
    )
    return schemas.map(({ name }) => ({ database, schema: name }))
  }

  async #scopeObjects({ connection, session }: Source, scope: ObjectScope): Promise<ScopeObjects> {
    const [tables, views] = await Promise.all([
      this.#cached(connection, ['tables', scope.database, scope.schema], async () =>
        session.listTables(scope, CatalogDetail.Names),
      ),
      this.#cached(connection, ['views', scope.database, scope.schema], async () =>
        session.listViews(scope),
      ),
    ])
    return { scope, tables: tables.map(({ name }) => name), views: views.map(({ name }) => name) }
  }

  async #cached<T>(
    connection: ConnectionConfig,
    parts: readonly string[],
    load: () => Promise<T>,
  ): Promise<T> {
    return this.#dependencies.cache.cached(connection.id, parts, load)
  }
}

interface Source {
  readonly connection: ConnectionConfig
  readonly session: EngineSession
}

function isUserScope(scope: ObjectScope): boolean {
  return !SYSTEM_SCOPES.has(scope.schema.toLowerCase())
}
