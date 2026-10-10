import type { Client } from 'pg'

import {
  CatalogDetail,
  type ColumnInfo,
  type DatabaseInfo,
  type ForeignKeyInfo,
  groupForeignKeyColumns,
  groupIndexColumns,
  type IndexInfo,
  type ObjectRef,
  type ObjectScope,
  readDatabaseStats,
  readTableStats,
  type SchemaInfo,
  type TableInfo,
  type ViewInfo,
} from '../../core/engine/catalog.ts'
import {
  type JsonRecord,
  readBoolean,
  readNullableString,
  readRecord,
  readString,
} from '../../core/json/record.ts'

const DATABASES = `SELECT datname AS name FROM pg_database
WHERE datallowconn AND NOT datistemplate ORDER BY datname`

// pg_database_size refuses a database the user may not connect to, unless the user reads every
// statistic (pg_read_all_stats): the size of the others is NULL instead of an error. Sizes travel as
// text: exact.
const DATABASES_WITH_SIZES = `SELECT datname AS name,
  CASE WHEN has_database_privilege(oid, 'CONNECT') OR pg_has_role('pg_read_all_stats', 'MEMBER')
    THEN pg_database_size(oid) END::text AS "sizeBytes"
FROM pg_database
WHERE datallowconn AND NOT datistemplate ORDER BY datname`

// Temporary and TOAST schemas belong to the server, not to the user.
const SCHEMAS = `SELECT nspname AS name FROM pg_namespace
WHERE nspname <> 'pg_toast' AND nspname NOT LIKE 'pg\\_temp\\_%' AND nspname NOT LIKE 'pg\\_toast\\_temp\\_%'
ORDER BY nspname`

// Ordinary, partitioned and foreign tables; partitions are listed under their parent elsewhere.
const TABLES = `SELECT c.relname AS name FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'f') AND NOT c.relispartition
ORDER BY c.relname`

// reltuples is -1 until the table is first analyzed. A partitioned table holds nothing itself: its
// statistics are those of its partitions. A foreign table has no size here.
const TABLES_WITH_STATS = `SELECT c.relname AS name,
  CASE
    WHEN c.relkind = 'p' THEN (
      SELECT (sum(p.reltuples) FILTER (WHERE p.reltuples >= 0))::bigint
      FROM pg_partition_tree(c.oid) t JOIN pg_class p ON p.oid = t.relid
      WHERE t.isleaf)
    WHEN c.reltuples >= 0 THEN c.reltuples::bigint
  END::text AS "estimatedRows",
  CASE c.relkind
    WHEN 'r' THEN pg_total_relation_size(c.oid)
    WHEN 'p' THEN (SELECT sum(pg_total_relation_size(t.relid))::bigint FROM pg_partition_tree(c.oid) t)
  END::text AS "sizeBytes"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'f') AND NOT c.relispartition
ORDER BY c.relname`

const VIEWS = `SELECT c.relname AS name, c.relkind = 'm' AS "isMaterialized" FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1 AND c.relkind IN ('v', 'm')
ORDER BY c.relname`

const COLUMNS = `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS "dataType",
  NOT a.attnotnull AS "isNullable", pg_get_expr(d.adbin, d.adrelid) AS "defaultValue",
  COALESCE(a.attnum = ANY (p.conkey), false) AS "isPrimaryKey"
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
LEFT JOIN pg_constraint p ON p.conrelid = c.oid AND p.contype = 'p'
WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum`

const INDEXES = `SELECT i.relname AS "indexName", pg_get_indexdef(x.indexrelid, k.position, true) AS "columnName",
  x.indisunique AS "isUnique", x.indisprimary AS "isPrimary"
FROM pg_index x
JOIN pg_class t ON t.oid = x.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_class i ON i.oid = x.indexrelid
CROSS JOIN LATERAL generate_series(1, x.indnkeyatts) AS k(position)
WHERE n.nspname = $1 AND t.relname = $2
ORDER BY NOT x.indisprimary, i.relname, k.position`

const RULES = `CASE %s WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
  WHEN 'n' THEN 'SET NULL' ELSE 'SET DEFAULT' END`

const FOREIGN_KEYS = `SELECT c.conname AS "constraintName", a.attname AS "columnName",
  fn.nspname AS "referencedSchema", ft.relname AS "referencedTable", fa.attname AS "referencedColumn",
  ${RULES.replace('%s', 'c.confupdtype')} AS "onUpdate", ${RULES.replace('%s', 'c.confdeltype')} AS "onDelete"
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(attnum, fattnum, position)
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
JOIN pg_class ft ON ft.oid = c.confrelid
JOIN pg_namespace fn ON fn.oid = ft.relnamespace
JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = k.fattnum
WHERE c.contype = 'f' AND n.nspname = $1 AND t.relname = $2
ORDER BY c.conname, k.position`

export async function queryRows(
  client: Client,
  sql: string,
  values: readonly (number | string)[],
): Promise<JsonRecord[]> {
  const result = await client.query<Record<string, unknown>>(sql, [...values])
  return result.rows.map(readRecord)
}

export async function listDatabases(
  client: Client,
  detail: CatalogDetail,
): Promise<DatabaseInfo[]> {
  if (detail === CatalogDetail.Names) {
    const rows = await queryRows(client, DATABASES, [])
    return rows.map((row) => ({ name: readString(row, 'name') }))
  }
  const rows = await queryRows(client, DATABASES_WITH_SIZES, [])
  return rows.map((row) => ({ name: readString(row, 'name'), stats: readDatabaseStats(row) }))
}

export async function listSchemas(client: Client): Promise<SchemaInfo[]> {
  const rows = await queryRows(client, SCHEMAS, [])
  return rows.map((row) => ({ name: readString(row, 'name') }))
}

export async function listTables(
  client: Client,
  scope: ObjectScope,
  detail: CatalogDetail,
): Promise<TableInfo[]> {
  if (detail === CatalogDetail.Names) {
    const rows = await queryRows(client, TABLES, [scope.schema])
    return rows.map((row) => ({ name: readString(row, 'name') }))
  }
  const rows = await queryRows(client, TABLES_WITH_STATS, [scope.schema])
  return rows.map((row) => ({ name: readString(row, 'name'), stats: readTableStats(row) }))
}

export async function listViews(client: Client, scope: ObjectScope): Promise<ViewInfo[]> {
  const rows = await queryRows(client, VIEWS, [scope.schema])
  return rows.map((row) => ({
    name: readString(row, 'name'),
    isMaterialized: readBoolean(row, 'isMaterialized'),
  }))
}

export async function listColumns(client: Client, object: ObjectRef): Promise<ColumnInfo[]> {
  const rows = await queryRows(client, COLUMNS, [object.schema, object.name])
  return rows.map((row) => ({
    name: readString(row, 'name'),
    dataType: readString(row, 'dataType'),
    isNullable: readBoolean(row, 'isNullable'),
    defaultValue: readNullableString(row, 'defaultValue'),
    isPrimaryKey: readBoolean(row, 'isPrimaryKey'),
  }))
}

export async function listIndexes(client: Client, table: ObjectRef): Promise<IndexInfo[]> {
  const rows = await queryRows(client, INDEXES, [table.schema, table.name])
  return groupIndexColumns(
    rows.map((row) => ({
      index: readString(row, 'indexName'),
      column: readString(row, 'columnName'),
      isUnique: readBoolean(row, 'isUnique'),
      isPrimary: readBoolean(row, 'isPrimary'),
    })),
  )
}

export async function listForeignKeys(client: Client, table: ObjectRef): Promise<ForeignKeyInfo[]> {
  const rows = await queryRows(client, FOREIGN_KEYS, [table.schema, table.name])
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
