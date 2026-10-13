import type { Connection } from 'mysql2'

import { RelationKind, type TableDescription } from '../../core/engine/table.ts'
import { type JsonRecord, readNullableString, readString } from '../../core/json/record.ts'
import { queryRows } from './mysql-catalog.ts'
import { type MysqlColumn, tableColumnOf } from './mysql-columns.ts'

// Numbers come back as text, which does not depend on how mysql2 reads big numbers.
const TABLE = `SELECT TABLE_TYPE AS tableType, COALESCE(ENGINE, '') AS engine
FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`

const COLUMNS = `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS columnType, DATA_TYPE AS dataType,
  IS_NULLABLE AS isNullable, CASE WHEN COLUMN_DEFAULT IS NULL THEN 'NO' ELSE 'YES' END AS hasDefault,
  EXTRA AS extra, CAST(CHARACTER_MAXIMUM_LENGTH AS CHAR) AS maxLength,
  CAST(NUMERIC_PRECISION AS CHAR) AS numericPrecision, CAST(NUMERIC_SCALE AS CHAR) AS numericScale,
  CAST(DATETIME_PRECISION AS CHAR) AS fraction
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`

// A unique index on an expression has a key part without a column: it cannot tell rows apart by
// their values.
const KEYS = `SELECT INDEX_NAME AS indexName, COLUMN_NAME AS columnName
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND NON_UNIQUE = 0
ORDER BY INDEX_NAME <> 'PRIMARY', INDEX_NAME, SEQ_IN_INDEX`

const YES = 'YES'
// The only engine whose changes a rollback undoes, among the ones MySQL ships.
const TRANSACTIONAL_ENGINE = 'innodb'
const KINDS: ReadonlyMap<string, RelationKind> = new Map([
  ['BASE TABLE', RelationKind.Table],
  ['VIEW', RelationKind.View],
])
// The table key of a result column: its database and its name.
const TABLE_KEY_PARTS = 2

export async function describeTable(
  connection: Connection,
  table: readonly string[],
): Promise<TableDescription | undefined> {
  const named = namedBy(table)
  const [relation] = named === undefined ? [] : await queryRows(connection, TABLE, named)
  if (named === undefined || relation === undefined) {
    return undefined
  }
  const columns = (await queryRows(connection, COLUMNS, named)).map(readColumn)
  const keys = keysOf(await queryRows(connection, KEYS, named), columns)
  const [schema, name] = named
  return {
    ref: { database: schema, schema, name },
    kind: KINDS.get(readString(relation, 'tableType')) ?? RelationKind.Other,
    problem: engineProblem(name, readString(relation, 'engine')),
    columns: columns.map(tableColumnOf),
    keys,
  }
}

// The database and the name of the table, as result columns name it.
function namedBy(table: readonly string[]): readonly [string, string] | undefined {
  const [schema, name] = table
  return table.length === TABLE_KEY_PARTS && schema !== undefined && name !== undefined
    ? [schema, name]
    : undefined
}

// Views have no engine: what makes them read-only is said elsewhere.
function engineProblem(name: string, engine: string): string {
  if (engine === '' || engine.toLowerCase() === TRANSACTIONAL_ENGINE) {
    return ''
  }
  return `"${name}" uses the ${engine} storage engine, which cannot roll changes back: sqldoro does not edit it.`
}

function readColumn(row: JsonRecord): MysqlColumn {
  return {
    name: readString(row, 'name'),
    columnType: readString(row, 'columnType'),
    dataType: readString(row, 'dataType'),
    isNullable: readString(row, 'isNullable') === YES,
    hasExplicitDefault: readString(row, 'hasDefault') === YES,
    extra: readString(row, 'extra'),
    maxLength: readWhole(row, 'maxLength'),
    precision: readWhole(row, 'numericPrecision'),
    scale: readWhole(row, 'numericScale'),
    fraction: readWhole(row, 'fraction'),
  }
}

function readWhole(row: JsonRecord, key: string): number | undefined {
  const text = readNullableString(row, key)
  return text === undefined ? undefined : Number(text)
}

// The unique indexes made only of columns that refuse NULL, the primary key first.
function keysOf(rows: readonly JsonRecord[], columns: readonly MysqlColumn[]): string[][] {
  const notNull = new Set(columns.filter((column) => !column.isNullable).map(({ name }) => name))
  const indexes = new Map<string, (string | undefined)[]>()
  for (const row of rows) {
    const index = readString(row, 'indexName')
    indexes.set(index, [...(indexes.get(index) ?? []), readNullableString(row, 'columnName')])
  }
  return [...indexes.values()].filter((parts) => isKey(parts, notNull))
}

function isKey(
  parts: readonly (string | undefined)[],
  notNull: ReadonlySet<string>,
): parts is string[] {
  return parts.every((part) => part !== undefined && notNull.has(part))
}
