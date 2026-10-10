import {
  type CatalogNeeds,
  type LoadedCatalog,
  objectKey,
  scopeKey,
  type ScopeObjects,
} from '../../core/completion/catalog-needs.ts'
import {
  CatalogDetail,
  type ColumnInfo,
  type ObjectRef,
  type ObjectScope,
} from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { Logger } from '../../core/platform.ts'
import { describeError } from '../../core/text/errors.ts'

export interface CatalogLoad {
  readonly catalog: LoadedCatalog
  // False when some of the catalog was still loading at the deadline: the editor asks again.
  readonly isComplete: boolean
}

// What the autocomplete knows of each connection's catalog: each list loads once, on first need,
// and stays until the explorer refreshes it or a statement changes the schema. A list that fails
// to load is asked again next time.
export class SchemaCache {
  readonly #log: Logger
  readonly #entries = new Map<string, Promise<unknown>>()

  constructor(log: Logger) {
    this.#log = log
  }

  invalidate(connectionId?: string): void {
    if (connectionId === undefined) {
      this.#entries.clear()
      return
    }
    for (const key of [...this.#entries.keys()]) {
      if (key.startsWith(`${JSON.stringify(connectionId)},`)) {
        this.#entries.delete(key)
      }
    }
  }

  // Waits for what the request needs until the deadline, never longer: a large schema does not hold
  // the editor up.
  async load(
    connectionId: string,
    session: EngineSession,
    { needs, deadline }: { readonly needs: CatalogNeeds; readonly deadline: Promise<unknown> },
  ): Promise<CatalogLoad> {
    const loaded = new LoadingCatalog()
    const source: Source = {
      session,
      loaded,
      cached: async (parts, load) => this.#cached([connectionId, ...parts], load),
    }
    const tasks = [
      ...databaseTasks(source, needs),
      ...schemaTasks(source, needs),
      ...needs.scopes.map(async (scope) => loadObjects(source, scope)),
      ...needs.tables.map(async (table) => loadColumns(source, table)),
    ]
    const isComplete = await Promise.race([
      Promise.allSettled(tasks).then(() => true),
      deadline.then(() => false),
    ])
    return { catalog: loaded.snapshot(), isComplete }
  }

  async #cached<T>(parts: readonly string[], load: () => Promise<T>): Promise<T> {
    const key = parts.map((part) => JSON.stringify(part)).join(',')
    const existing = this.#entries.get(key) as Promise<T> | undefined
    if (existing !== undefined) {
      return existing
    }
    const loading = load()
    this.#entries.set(key, loading)
    loading.catch((error: unknown) => {
      this.#entries.delete(key)
      this.#log.debug(
        `The autocomplete could not load ${parts.slice(1).join(' ')}: ${describeError(error)}`,
      )
    })
    return loading
  }
}

function nameOf({ name }: { readonly name: string }): string {
  return name
}

type Cached = <T>(parts: readonly string[], load: () => Promise<T>) => Promise<T>

interface Source {
  readonly session: EngineSession
  readonly loaded: LoadingCatalog
  readonly cached: Cached
}

function databaseTasks({ session, loaded, cached }: Source, needs: CatalogNeeds): Promise<void>[] {
  if (!needs.hasDatabases) {
    return []
  }
  return [
    cached(['databases'], async () => session.listDatabases(CatalogDetail.Names)).then((list) => {
      loaded.setDatabases(list)
    }),
  ]
}

function schemaTasks({ session, loaded, cached }: Source, needs: CatalogNeeds): Promise<void>[] {
  const database = needs.schemasOf
  if (database === undefined) {
    return []
  }
  return [
    cached(['schemas', database], async () => session.listSchemas(database)).then((list) => {
      loaded.setSchemas(list)
    }),
  ]
}

async function loadObjects({ session, loaded, cached }: Source, scope: ObjectScope): Promise<void> {
  const [tables, views] = await Promise.all([
    cached(['tables', scope.database, scope.schema], async () =>
      session.listTables(scope, CatalogDetail.Names),
    ),
    cached(['views', scope.database, scope.schema], async () => session.listViews(scope)),
  ])
  loaded.setObjects(scopeKey(scope), { tables: tables.map(nameOf), views: views.map(nameOf) })
}

async function loadColumns({ session, loaded, cached }: Source, table: ObjectRef): Promise<void> {
  const parts = ['columns', table.database, table.schema, table.name]
  loaded.setColumns(objectKey(table), await cached(parts, async () => session.listColumns(table)))
}

// The parts of the catalog that arrived, copied when the request is answered.
class LoadingCatalog {
  #databases: readonly string[] = []
  #schemas: readonly string[] = []
  readonly #objects = new Map<string, ScopeObjects>()
  readonly #columns = new Map<string, readonly ColumnInfo[]>()

  setDatabases(list: readonly { readonly name: string }[]): void {
    this.#databases = list.map(nameOf)
  }

  setSchemas(list: readonly { readonly name: string }[]): void {
    this.#schemas = list.map(nameOf)
  }

  setObjects(key: string, objects: ScopeObjects): void {
    this.#objects.set(key, objects)
  }

  setColumns(key: string, columns: readonly ColumnInfo[]): void {
    this.#columns.set(key, columns)
  }

  snapshot(): LoadedCatalog {
    return {
      databases: this.#databases,
      schemas: this.#schemas,
      objects: new Map(this.#objects),
      columns: new Map(this.#columns),
    }
  }
}
