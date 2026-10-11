import * as vscode from 'vscode'

import { scopeKey } from '../../core/completion/catalog-needs.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { CatalogDetail, type ObjectScope } from '../../core/engine/catalog.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { Logger } from '../../core/platform.ts'
import type { IndexedConnection, IndexedScope } from '../../core/table-search/found.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SchemaCache } from '../completion/schema-cache.ts'
import type { SessionManager } from '../sessions/session-manager.ts'

export interface ConnectionObjects {
  readonly connection: ConnectionConfig
  readonly scopes: readonly IndexedScope[]
}

// What the index holds of a connected connection, with the connection it is of.
export interface IndexedSource extends IndexedConnection {
  readonly connection: ConnectionConfig
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

// What is loaded of the tables of a connection, namespace by namespace, in the order of the
// namespaces whatever the order they arrive in.
class LoadingIndex {
  #scopes: readonly ObjectScope[] = []
  readonly #objects = new Map<string, IndexedScope>()
  #isLoading = true

  get isLoading(): boolean {
    return this.#isLoading
  }

  setScopes(scopes: readonly ObjectScope[]): void {
    this.#scopes = scopes
  }

  add(objects: IndexedScope): void {
    this.#objects.set(scopeKey(objects.scope), objects)
  }

  finish(): void {
    this.#isLoading = false
  }

  loaded(): IndexedScope[] {
    return this.#scopes.flatMap((scope) => {
      const objects = this.#objects.get(scopeKey(scope))
      return objects === undefined ? [] : [objects]
    })
  }
}

// Every table and view of the connected connections, to find them by name: the lists load once,
// with the schema cache (so the autocomplete shares them). Finding a table reads what is loaded
// in memory (`snapshot`) on every keystroke and never queries the server: the lists load when it
// starts (`load`), each namespace showing as it arrives, until the explorer refreshes the
// connection (`forget`). A MySQL connection lists every database of its server; a PostgreSQL
// connection the schemas of the database it names.
export class TableIndex implements vscode.Disposable {
  readonly #dependencies: TableIndexDependencies
  readonly #indexes = new Map<string, LoadingIndex>()
  readonly #loads = new Map<string, Promise<void>>()
  readonly #changes = new vscode.EventEmitter<undefined>()
  // Fires when more is loaded, or what was loaded is forgotten.
  readonly onDidChange = this.#changes.event

  constructor(dependencies: TableIndexDependencies) {
    this.#dependencies = dependencies
  }

  // Every table and view of the connected connections, once loaded (Go to Table).
  async objects(): Promise<readonly ConnectionObjects[]> {
    return Promise.all(this.#connected().map(async (source) => this.#objectsOf(source)))
  }

  // What is loaded now of each connected connection, in the order of the connections. A
  // connection not loaded yet is loading, with nothing.
  snapshot(): IndexedSource[] {
    return this.#connected().map(({ connection, hasSchemas }) => {
      const index = this.#indexes.get(connection.id)
      return {
        connection,
        connectionId: connection.id,
        hasSchemas,
        isLoading: index?.isLoading ?? true,
        scopes: index?.loaded() ?? [],
      }
    })
  }

  // Loads the connected connections it does not hold; resolves once all of them are loaded.
  async load(): Promise<void> {
    await Promise.all(this.#connected().map(async (source) => this.#loadOnce(source)))
  }

  // Forgets what was loaded of a connection, or of all: it loads again on the next `load`.
  forget(connectionId?: string): void {
    if (connectionId === undefined) {
      this.#indexes.clear()
      this.#loads.clear()
    } else {
      this.#indexes.delete(connectionId)
      this.#loads.delete(connectionId)
    }
    this.#changes.fire(undefined)
  }

  dispose(): void {
    this.#changes.dispose()
  }

  // The connected connections of a known engine: one sqldoro has no driver for cannot be searched.
  #connected(): Source[] {
    const { connections, sessions, engines } = this.#dependencies
    return connections().flatMap((connection) => {
      const session = sessions.session(connection.id)?.engineSession
      const engine = engines.find(connection.engine)
      return session === undefined || engine === undefined
        ? []
        : [{ connection, session, hasSchemas: engine.dialect.hasSchemas }]
    })
  }

  async #loadOnce(source: Source): Promise<void> {
    const { id } = source.connection
    const known = this.#loads.get(id)
    if (known !== undefined) {
      return known
    }
    const index = new LoadingIndex()
    this.#indexes.set(id, index)
    const loading = this.#fill(source, index)
    this.#loads.set(id, loading)
    return loading
  }

  // Each namespace shows as soon as its lists arrive; what a forgotten load brings is dropped.
  async #fill(source: Source, index: LoadingIndex): Promise<void> {
    const changed = (): void => {
      if (this.#indexes.get(source.connection.id) === index) {
        this.#changes.fire(undefined)
      }
    }
    try {
      const scopes = await this.#scopesOf(source)
      index.setScopes(scopes)
      await Promise.all(
        scopes.map(async (scope) => {
          index.add(await this.#scopeObjects(source, scope))
          changed()
        }),
      )
    } catch (error) {
      this.#warn(source.connection, error)
    }
    index.finish()
    changed()
  }

  async #objectsOf(source: Source): Promise<ConnectionObjects> {
    try {
      const scopes = await this.#scopesOf(source)
      return {
        connection: source.connection,
        scopes: await Promise.all(scopes.map(async (scope) => this.#scopeObjects(source, scope))),
      }
    } catch (error) {
      this.#warn(source.connection, error)
      return { connection: source.connection, scopes: [] }
    }
  }

  #warn(connection: ConnectionConfig, error: unknown): void {
    this.#dependencies.log.warn(
      `Could not list the tables of "${connection.name}": ${describeError(error)}`,
    )
  }

  async #scopesOf(source: Source): Promise<ObjectScope[]> {
    const { hasSchemas } = source
    const databases = await this.#databasesOf(source, hasSchemas)
    if (!hasSchemas) {
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

  async #scopeObjects({ connection, session }: Source, scope: ObjectScope): Promise<IndexedScope> {
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
  readonly hasSchemas: boolean
}

function isUserScope(scope: ObjectScope): boolean {
  return !SYSTEM_SCOPES.has(scope.schema.toLowerCase())
}
