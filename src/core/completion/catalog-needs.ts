import type { ColumnInfo, ObjectRef, ObjectScope } from '../engine/catalog.ts'
import type { Dialect } from '../engine/dialect.ts'
import { Clause, type CompletionContext } from './context.ts'
import type { TableReference } from './references.ts'

type SchemaDialect = Pick<Dialect, 'hasSchemas'>

// The catalog the autocomplete needs for one request: loaded by the host, on demand and cached.
export interface CatalogNeeds {
  readonly hasDatabases: boolean
  // The database whose schemas are offered (PostgreSQL), if any.
  readonly schemasOf: string | undefined
  readonly scopes: readonly ObjectScope[]
  readonly tables: readonly ObjectRef[]
}

export interface ScopeObjects {
  readonly tables: readonly string[]
  readonly views: readonly string[]
}

// What the host could load in time, keyed by scopeKey and objectKey.
export interface LoadedCatalog {
  readonly databases: readonly string[]
  readonly schemas: readonly string[]
  readonly objects: ReadonlyMap<string, ScopeObjects>
  readonly columns: ReadonlyMap<string, readonly ColumnInfo[]>
}

export const NO_NEEDS: CatalogNeeds = {
  hasDatabases: false,
  schemasOf: undefined,
  scopes: [],
  tables: [],
}

// A statement can name many tables: only this many have their columns loaded.
const MAX_TABLES = 20
const QUALIFIED_PARTS = 2

export function scopeKey(scope: ObjectScope): string {
  return JSON.stringify([scope.database, scope.schema])
}

export function objectKey(object: ObjectRef): string {
  return JSON.stringify([object.database, object.schema, object.name])
}

// A name before a dot is a schema of the current database in PostgreSQL, a database in MySQL.
export function namedScope(name: string, scope: ObjectScope, dialect: SchemaDialect): ObjectScope {
  return dialect.hasSchemas
    ? { database: scope.database, schema: name }
    : { database: name, schema: name }
}

export function resolveTable(
  parts: readonly string[],
  scope: ObjectScope,
  dialect: SchemaDialect,
): ObjectRef | undefined {
  const name = parts.at(-1)
  if (name === undefined || parts.length > QUALIFIED_PARTS) {
    return undefined
  }
  const qualifier = parts.length === QUALIFIED_PARTS ? parts.at(0) : undefined
  return { ...(qualifier === undefined ? scope : namedScope(qualifier, scope, dialect)), name }
}

export function catalogNeeds(
  context: CompletionContext,
  scope: ObjectScope,
  dialect: SchemaDialect,
): CatalogNeeds {
  const [qualifier] = context.qualifier
  if (context.isInText) {
    return NO_NEEDS
  }
  if (qualifier === undefined) {
    return unqualifiedNeeds(context, scope, dialect)
  }
  return context.qualifier.length === 1
    ? qualifiedNeeds(qualifier, context, { scope, dialect })
    : tablesNeeds([resolveTable(context.qualifier, scope, dialect)])
}

function unqualifiedNeeds(
  context: CompletionContext,
  scope: ObjectScope,
  dialect: SchemaDialect,
): CatalogNeeds {
  if (context.clause === Clause.Column) {
    return tablesNeeds(context.references.map(({ parts }) => resolveTable(parts, scope, dialect)))
  }
  if (context.clause === Clause.Other) {
    return NO_NEEDS
  }
  return {
    hasDatabases: !dialect.hasSchemas,
    schemasOf: dialect.hasSchemas ? scope.database : undefined,
    scopes: scope.database === '' ? [] : [scope],
    tables: [],
  }
}

interface Resolution {
  readonly scope: ObjectScope
  readonly dialect: SchemaDialect
}

// "o." is an alias or a table of the statement; anything else may be a schema (or a database) or a
// table the statement does not name yet.
function qualifiedNeeds(
  qualifier: string,
  context: CompletionContext,
  { scope, dialect }: Resolution,
): CatalogNeeds {
  const reference = findReference(context.references, qualifier)
  if (reference !== undefined) {
    return tablesNeeds([resolveTable(reference.parts, scope, dialect)])
  }
  const tables = context.clause === Clause.Table ? [] : [resolveTable([qualifier], scope, dialect)]
  return { ...tablesNeeds(tables), scopes: [namedScope(qualifier, scope, dialect)] }
}

export function findReference(
  references: readonly TableReference[],
  name: string,
): TableReference | undefined {
  const key = name.toLowerCase()
  return (
    references.find((reference) => reference.alias?.toLowerCase() === key) ??
    references.find(
      (reference) => reference.alias === undefined && reference.parts.at(-1)?.toLowerCase() === key,
    )
  )
}

function tablesNeeds(tables: readonly (ObjectRef | undefined)[]): CatalogNeeds {
  const unique = new Map<string, ObjectRef>()
  for (const table of tables) {
    if (table !== undefined) {
      unique.set(objectKey(table), table)
    }
  }
  return { ...NO_NEEDS, tables: [...unique.values()].slice(0, MAX_TABLES) }
}
