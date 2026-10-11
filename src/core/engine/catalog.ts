import { type JsonRecord, readBigCount, readNullable } from '../json/record.ts'

// How much a list of the catalog reads: the names only, or the statistics of each object too (sizes
// and estimated rows), which cost the server more. The explorer asks for them; the autocomplete and
// the pickers only need the names.
export const CatalogDetail = {
  Names: 'names',
  Statistics: 'statistics',
} as const

export type CatalogDetail = (typeof CatalogDetail)[keyof typeof CatalogDetail]

export interface DatabaseStats {
  // Data and indexes, in bytes; undefined when the server does not say (no privilege to see it).
  readonly sizeBytes: bigint | undefined
}

export interface DatabaseInfo {
  readonly name: string
  // Only in a list read with CatalogDetail.Statistics.
  readonly stats?: DatabaseStats
}

export interface SchemaInfo {
  readonly name: string
}

// The namespace that holds tables: a schema in PostgreSQL, the database itself in MySQL.
export interface ObjectScope {
  readonly database: string
  readonly schema: string
}

export interface ObjectRef extends ObjectScope {
  readonly name: string
}

// The objects whose definition (DDL) can be shown.
export const ObjectKind = {
  Table: 'table',
  View: 'view',
} as const

export type ObjectKind = (typeof ObjectKind)[keyof typeof ObjectKind]

// What the catalog statistics say of a table: estimates the server refreshes when it analyzes it.
export interface TableStats {
  // undefined when the server has no estimate yet (a table never analyzed).
  readonly estimatedRows: bigint | undefined
  // Data, indexes and TOAST, in bytes; undefined when the table has no storage of its own (foreign).
  readonly sizeBytes: bigint | undefined
}

export interface TableInfo {
  readonly name: string
  // Only in a list read with CatalogDetail.Statistics.
  readonly stats?: TableStats
}

export interface ViewInfo {
  readonly name: string
  readonly isMaterialized: boolean
}

export interface ColumnInfo {
  readonly name: string
  readonly dataType: string
  readonly isNullable: boolean
  readonly defaultValue: string | undefined
  readonly isPrimaryKey: boolean
}

export interface IndexInfo {
  readonly name: string
  readonly columns: readonly string[]
  readonly isUnique: boolean
  readonly isPrimary: boolean
}

export interface ForeignKeyInfo {
  readonly name: string
  readonly columns: readonly string[]
  readonly referencedSchema: string
  readonly referencedTable: string
  readonly referencedColumns: readonly string[]
  readonly onUpdate: string
  readonly onDelete: string
}

// A foreign key of another table that points at a table: the rows of that table that reference a
// row of this one.
export interface ReferenceInfo {
  readonly name: string
  // The table that holds the foreign key, in the namespace of its own (a database in MySQL).
  readonly schema: string
  readonly table: string
  readonly columns: readonly string[]
  // The columns of the referenced table, in the order of the foreign key.
  readonly referencedColumns: readonly string[]
}

// One row per column of an index, in index then key order, as the catalog queries return them.
export interface IndexColumn {
  readonly index: string
  readonly column: string
  readonly isUnique: boolean
  readonly isPrimary: boolean
}

// One row per column of a foreign key, in constraint then key order.
export interface ForeignKeyColumn {
  readonly constraint: string
  readonly column: string
  readonly referencedSchema: string
  readonly referencedTable: string
  readonly referencedColumn: string
  readonly onUpdate: string
  readonly onDelete: string
}

// One row per column of a foreign key that points at a table, in table, constraint then key order.
export interface ReferenceColumn {
  readonly schema: string
  readonly table: string
  readonly constraint: string
  readonly column: string
  readonly referencedColumn: string
}

export function groupIndexColumns(rows: readonly IndexColumn[]): IndexInfo[] {
  const indexes = new Map<string, IndexInfo>()
  for (const row of rows) {
    const index = indexes.get(row.index)
    const columns = index === undefined ? [row.column] : [...index.columns, row.column]
    indexes.set(row.index, {
      name: row.index,
      columns,
      isUnique: row.isUnique,
      isPrimary: row.isPrimary,
    })
  }
  return [...indexes.values()]
}

export function groupForeignKeyColumns(rows: readonly ForeignKeyColumn[]): ForeignKeyInfo[] {
  const foreignKeys = new Map<string, ForeignKeyInfo>()
  for (const row of rows) {
    foreignKeys.set(row.constraint, addForeignKeyColumn(foreignKeys.get(row.constraint), row))
  }
  return [...foreignKeys.values()]
}

// A constraint name is unique in its table only: the table is part of what tells two apart.
export function groupReferenceColumns(rows: readonly ReferenceColumn[]): ReferenceInfo[] {
  const references = new Map<string, ReferenceInfo>()
  for (const row of rows) {
    const key = JSON.stringify([row.schema, row.table, row.constraint])
    references.set(key, addReferenceColumn(references.get(key), row))
  }
  return [...references.values()]
}

function addReferenceColumn(
  reference: ReferenceInfo | undefined,
  row: ReferenceColumn,
): ReferenceInfo {
  return {
    name: row.constraint,
    schema: row.schema,
    table: row.table,
    columns: [...(reference?.columns ?? []), row.column],
    referencedColumns: [...(reference?.referencedColumns ?? []), row.referencedColumn],
  }
}

function addForeignKeyColumn(
  foreignKey: ForeignKeyInfo | undefined,
  row: ForeignKeyColumn,
): ForeignKeyInfo {
  return {
    name: row.constraint,
    columns: [...(foreignKey?.columns ?? []), row.column],
    referencedSchema: row.referencedSchema,
    referencedTable: row.referencedTable,
    referencedColumns: [...(foreignKey?.referencedColumns ?? []), row.referencedColumn],
    onUpdate: row.onUpdate,
    onDelete: row.onDelete,
  }
}

// The statistics columns of a catalog row: the drivers' queries name them estimatedRows and
// sizeBytes, as decimal text or NULL.
export function readTableStats(row: JsonRecord): TableStats {
  return {
    estimatedRows: readOptionalBigCount(row, 'estimatedRows'),
    sizeBytes: readOptionalBigCount(row, 'sizeBytes'),
  }
}

export function readDatabaseStats(row: JsonRecord): DatabaseStats {
  return { sizeBytes: readOptionalBigCount(row, 'sizeBytes') }
}

function readOptionalBigCount(row: JsonRecord, key: string): bigint | undefined {
  return readNullable(row, key, readBigCount) ?? undefined
}
