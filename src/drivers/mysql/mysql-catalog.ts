import type { Connection, RowDataPacket } from 'mysql2'

import {
  type ColumnInfo,
  type DatabaseInfo,
  type ForeignKeyInfo,
  groupForeignKeyColumns,
  groupIndexColumns,
  type IndexInfo,
  type ObjectRef,
  type ObjectScope,
  type TableInfo,
  type ViewInfo,
} from '../../core/engine/catalog.ts'
import {
  type JsonRecord,
  readNullableString,
  readRecord,
  readString,
} from '../../core/json/record.ts'

// In MySQL a schema is a database: the scope's schema names it. Flags come back as 'YES'/'NO' text,
// which does not depend on how the server types a comparison.
const YES = 'YES'

const DATABASES = 'SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME'

const TABLES_OF_TYPE = `SELECT TABLE_NAME AS name FROM information_schema.TABLES
WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME`

const COLUMNS = `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS dataType, IS_NULLABLE AS isNullable,
  COLUMN_DEFAULT AS defaultValue, CASE WHEN COLUMN_KEY = 'PRI' THEN 'YES' ELSE 'NO' END AS isPrimaryKey
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`

const INDEXES = `SELECT INDEX_NAME AS indexName, COALESCE(COLUMN_NAME, '(expression)') AS columnName,
  CASE WHEN NON_UNIQUE = 0 THEN 'YES' ELSE 'NO' END AS isUnique,
  CASE WHEN INDEX_NAME = 'PRIMARY' THEN 'YES' ELSE 'NO' END AS isPrimary
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
ORDER BY INDEX_NAME <> 'PRIMARY', INDEX_NAME, SEQ_IN_INDEX`

const FOREIGN_KEYS = `SELECT k.CONSTRAINT_NAME AS constraintName, k.COLUMN_NAME AS columnName,
  k.REFERENCED_TABLE_SCHEMA AS referencedSchema, k.REFERENCED_TABLE_NAME AS referencedTable,
  k.REFERENCED_COLUMN_NAME AS referencedColumn, r.UPDATE_RULE AS onUpdate, r.DELETE_RULE AS onDelete
FROM information_schema.KEY_COLUMN_USAGE k
JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
  AND r.TABLE_NAME = k.TABLE_NAME
WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION`

// Nothing is parsed inside the mysql2 callback: an exception there would escape every handler.
export async function runQuery(
  connection: Connection,
  sql: string,
  values: readonly (number | string)[],
): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>()
  connection.query<RowDataPacket[]>({ sql, values: [...values] }, (error: unknown, result) => {
    if (error instanceof Error) {
      reject(error)
      return
    }
    resolve(result)
  })
  return promise
}

export async function queryRows(
  connection: Connection,
  sql: string,
  values: readonly (number | string)[],
): Promise<JsonRecord[]> {
  const result = await runQuery(connection, sql, values)
  if (!Array.isArray(result)) {
    throw new TypeError('The server answered without rows')
  }
  return result.map(readRecord)
}

export async function listDatabases(connection: Connection): Promise<DatabaseInfo[]> {
  const rows = await queryRows(connection, DATABASES, [])
  return rows.map((row) => ({ name: readString(row, 'name') }))
}

export async function listTables(connection: Connection, scope: ObjectScope): Promise<TableInfo[]> {
  const rows = await queryRows(connection, TABLES_OF_TYPE, [scope.schema, 'BASE TABLE'])
  return rows.map((row) => ({ name: readString(row, 'name') }))
}

export async function listViews(connection: Connection, scope: ObjectScope): Promise<ViewInfo[]> {
  const rows = await queryRows(connection, TABLES_OF_TYPE, [scope.schema, 'VIEW'])
  return rows.map((row) => ({ name: readString(row, 'name'), isMaterialized: false }))
}

export async function listColumns(
  connection: Connection,
  object: ObjectRef,
): Promise<ColumnInfo[]> {
  const rows = await queryRows(connection, COLUMNS, [object.schema, object.name])
  return rows.map((row) => ({
    name: readString(row, 'name'),
    dataType: readString(row, 'dataType'),
    isNullable: readString(row, 'isNullable') === YES,
    defaultValue: readNullableString(row, 'defaultValue'),
    isPrimaryKey: readString(row, 'isPrimaryKey') === YES,
  }))
}

export async function listIndexes(connection: Connection, table: ObjectRef): Promise<IndexInfo[]> {
  const rows = await queryRows(connection, INDEXES, [table.schema, table.name])
  return groupIndexColumns(
    rows.map((row) => ({
      index: readString(row, 'indexName'),
      column: readString(row, 'columnName'),
      isUnique: readString(row, 'isUnique') === YES,
      isPrimary: readString(row, 'isPrimary') === YES,
    })),
  )
}

export async function listForeignKeys(
  connection: Connection,
  table: ObjectRef,
): Promise<ForeignKeyInfo[]> {
  const rows = await queryRows(connection, FOREIGN_KEYS, [table.schema, table.name])
  return groupForeignKeyColumns(
    rows.map((row) => ({
      constraint: readString(row, 'constraintName'),
      column: readString(row, 'columnName'),
      referencedSchema: readString(row, 'referencedSchema'),
      referencedTable: readString(row, 'referencedTable'),
      referencedColumn: readString(row, 'referencedColumn'),
      onUpdate: readString(row, 'onUpdate'),
      onDelete: readString(row, 'onDelete'),
    })),
  )
}
