import type { ObjectRef } from '../../core/engine/catalog.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { TableDescription } from '../../core/engine/table.ts'
import {
  type ForeignKeyLink,
  foreignKeyLinks,
  type Reference,
  referencesOf,
} from '../../core/navigation/links.ts'
import type { SchemaCache } from '../completion/schema-cache.ts'

// Where the catalog of a connection is read: the session of the explorer, never a session of an
// editor or a table panel (their transactions stay as they are).
export interface CatalogSource {
  readonly connectionId: string
  readonly session: EngineSession
  readonly dialect: Pick<Dialect, 'hasSchemas'>
}

export interface TableRelations {
  readonly foreignKeys: readonly ForeignKeyLink[]
  readonly references: readonly Reference[]
}

// What the result grid needs of the tables of a connection: their description, their foreign keys
// and the foreign keys that point at them. Each is read once per table and kept with the schema
// cache, so a refresh of the explorer reads it again.
export class TableMetadata {
  readonly #cache: Pick<SchemaCache, 'cached'>

  constructor(cache: Pick<SchemaCache, 'cached'>) {
    this.#cache = cache
  }

  // The table result columns come from, by the reference the server gave (ColumnOrigin.table), in a
  // database of the session (empty: its own).
  async describe(
    source: CatalogSource,
    origin: { readonly database: string; readonly table: readonly string[] },
  ): Promise<TableDescription | undefined> {
    return this.#cache.cached(
      source.connectionId,
      ['description', origin.database, ...origin.table],
      async () => source.session.describeTable(origin.database, origin.table),
    )
  }

  // A table by where it is: a table a navigation leads to before any of its rows were read.
  async describeAt(source: CatalogSource, table: ObjectRef): Promise<TableDescription | undefined> {
    return this.#cache.cached(
      source.connectionId,
      ['place', table.database, table.schema, table.name],
      async () => source.session.describeTableAt(table),
    )
  }

  async relations(source: CatalogSource, table: ObjectRef): Promise<TableRelations> {
    return this.#cache.cached(
      source.connectionId,
      ['relations', table.database, table.schema, table.name],
      async () => {
        const [foreignKeys, references] = await Promise.all([
          source.session.listForeignKeys(table),
          source.session.listReferences(table),
        ])
        return {
          foreignKeys: foreignKeyLinks(foreignKeys, table, source.dialect),
          references: referencesOf(references, table, source.dialect),
        }
      },
    )
  }

  // The type each column's values are compared as, by column name, where the catalog says.
  async parameterTypes(
    source: CatalogSource,
    table: ObjectRef,
  ): Promise<ReadonlyMap<string, string>> {
    const description = await this.describeAt(source, table)
    return new Map(
      (description?.columns ?? []).flatMap(({ name, sql }) =>
        sql.parameterType === '' ? [] : [[name, sql.parameterType] as const],
      ),
    )
  }
}
