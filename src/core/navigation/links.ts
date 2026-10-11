import type { ForeignKeyInfo, ObjectRef, ReferenceInfo } from '../engine/catalog.ts'
import type { Dialect } from '../engine/dialect.ts'
import type { Row } from '../engine/query.ts'
import type { KeyMatch, KeyPart } from './keys.ts'

// Where a column of a result comes from: a table (by the key the caller gives each table) and the
// name of the column in it.
export interface ColumnSource {
  readonly table: string
  readonly column: string
}

// A foreign key of a table, and the table it points at.
export interface ForeignKeyLink {
  readonly name: string
  readonly columns: readonly string[]
  readonly target: ObjectRef
  readonly targetColumns: readonly string[]
}

// A foreign key of another table that points at a table: its rows reference the rows of this one.
export interface Reference {
  readonly name: string
  readonly table: ObjectRef
  readonly columns: readonly string[]
  // The columns of the referenced table they hold the values of.
  readonly referencedColumns: readonly string[]
}

// What the catalog says of a table: where its foreign keys point, and what points at it.
export interface TableLinks {
  readonly table: string
  readonly foreignKeys: readonly ForeignKeyLink[]
  readonly references: readonly Reference[]
}

// A column of the key a navigation reads, and the position of the result column that holds its
// value.
export interface KeyColumn {
  readonly column: string
  readonly position: number
}

// A foreign key whose columns are all in a result: the columns of the table it points at, each with
// the result column that holds its value.
export interface ResultLink {
  readonly foreignKey: ForeignKeyLink
  readonly key: readonly KeyColumn[]
}

// A reference to a table whose referenced columns are all in a result: the columns of the
// referencing table, each with the result column that holds its value.
export interface ResultReference {
  readonly reference: Reference
  readonly key: readonly KeyColumn[]
}

type Located = Pick<Dialect, 'hasSchemas'>

// The table a foreign key points at, in the database of the table it belongs to (PostgreSQL), or in
// the database it names (MySQL, where a schema is a database).
export function foreignKeyLinks(
  foreignKeys: readonly ForeignKeyInfo[],
  table: ObjectRef,
  dialect: Located,
): ForeignKeyLink[] {
  return foreignKeys.map((foreignKey) => ({
    name: foreignKey.name,
    columns: foreignKey.columns,
    target: located(
      table,
      { schema: foreignKey.referencedSchema, name: foreignKey.referencedTable },
      dialect,
    ),
    targetColumns: foreignKey.referencedColumns,
  }))
}

export function referencesOf(
  references: readonly ReferenceInfo[],
  table: ObjectRef,
  dialect: Located,
): Reference[] {
  return references.map((reference) => ({
    name: reference.name,
    table: located(table, { schema: reference.schema, name: reference.table }, dialect),
    columns: reference.columns,
    referencedColumns: reference.referencedColumns,
  }))
}

function located(
  from: ObjectRef,
  { schema, name }: Pick<ObjectRef, 'name' | 'schema'>,
  dialect: Located,
): ObjectRef {
  return { database: dialect.hasSchemas ? from.database : schema, schema, name }
}

// The foreign keys of the tables of a result whose columns the result holds.
export function resultLinks(
  sources: readonly (ColumnSource | undefined)[],
  tables: readonly TableLinks[],
): ResultLink[] {
  return tables.flatMap(({ table, foreignKeys }) =>
    foreignKeys.flatMap((foreignKey) => {
      const key = keyColumns(sources, {
        table,
        held: foreignKey.columns,
        named: foreignKey.targetColumns,
      })
      return key === undefined ? [] : [{ foreignKey, key }]
    }),
  )
}

// The references to the tables of a result whose referenced columns the result holds.
export function resultReferences(
  sources: readonly (ColumnSource | undefined)[],
  tables: readonly TableLinks[],
): ResultReference[] {
  return tables.flatMap(({ table, references }) =>
    references.flatMap((reference) => {
      const key = keyColumns(sources, {
        table,
        held: reference.referencedColumns,
        named: reference.columns,
      })
      return key === undefined ? [] : [{ reference, key }]
    }),
  )
}

interface KeyColumns {
  // The table of the result whose columns hold the values.
  readonly table: string
  // Its columns that hold them, and the columns of the key they are the values of, in key order.
  readonly held: readonly string[]
  readonly named: readonly string[]
}

// Each column of the key with the result column that holds its value; undefined when the result
// lacks one, or when the catalog paired the columns wrongly.
function keyColumns(
  sources: readonly (ColumnSource | undefined)[],
  { table, held, named }: KeyColumns,
): KeyColumn[] | undefined {
  const key = named.map((column, index) => ({
    column,
    position: sources.findIndex(
      (source) => source?.table === table && source.column === held.at(index),
    ),
  }))
  return held.length !== named.length || key.some(({ position }) => position === -1)
    ? undefined
    : key
}

// The first foreign key a column of the result is part of.
export function linkAt(links: readonly ResultLink[], column: number): ResultLink | undefined {
  return links.find((link) => link.key.some(({ position }) => position === column))
}

// The row a link of a row points at; undefined when one of its columns is NULL (it points nowhere).
export function linkKey(link: ResultLink, row: Row): KeyMatch | undefined {
  return keyOf(link.key, row, true)
}

// The rows that reference a row: those whose foreign key holds its referenced values.
export function referenceKey(reference: ResultReference, row: Row): KeyMatch | undefined {
  return keyOf(reference.key, row, false)
}

function keyOf(key: readonly KeyColumn[], row: Row, isRowKey: boolean): KeyMatch | undefined {
  const parts: KeyPart[] = []
  for (const { column, position } of key) {
    const value = row.at(position) ?? null
    if (value === null) {
      return undefined
    }
    parts.push({ column, value })
  }
  return { parts, isRowKey }
}

// "public.condominium (id)": the table a link points at and its columns, as people read them.
export function linkLabel(foreignKey: ForeignKeyLink, home: ObjectRef): string {
  return `${tableLabel(foreignKey.target, home)} (${foreignKey.targetColumns.join(', ')})`
}

export function referenceLabel(reference: Reference, home: ObjectRef): string {
  return `${tableLabel(reference.table, home)} (${reference.columns.join(', ')})`
}

// The name of a table, with its schema (or database) when it is not the one of `home`.
export function tableLabel(table: ObjectRef, home: ObjectRef): string {
  return table.schema === home.schema ? table.name : `${table.schema}.${table.name}`
}
