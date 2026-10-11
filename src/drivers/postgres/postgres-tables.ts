import type { Client } from 'pg'

import type { ObjectRef } from '../../core/engine/catalog.ts'
import { RelationKind, type TableDescription } from '../../core/engine/table.ts'
import {
  type JsonRecord,
  readBoolean,
  readNullableString,
  readNumber,
  readString,
} from '../../core/json/record.ts'
import { queryRows } from './postgres-catalog.ts'
import { type PostgresColumn, tableColumnOf } from './postgres-columns.ts'

// A table named by its schema and its name, as the catalog keeps it.
const RELATION_ID = `SELECT c.oid::text AS id FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1 AND c.relname = $2`

const RELATION = `SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind,
  EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhparent = c.oid) AS "hasChildren"
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.oid = $1`

// The values of enum types come as a JSON list: pg would hand an array over as its text.
const COLUMNS = `SELECT a.attnum::text AS reference, a.attname AS name,
  format_type(a.atttypid, a.atttypmod) AS "dataType", t.typname AS "typeName",
  t.typtype::text AS "typeType", t.typcategory::text AS category, NOT a.attnotnull AS "isNullable",
  a.atthasdef AS "hasDefault", a.attidentity::text AS identity, a.attgenerated::text AS generated,
  a.atttypmod AS modifier,
  (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid)::text AS labels
FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum`

// Valid unique indexes on whole rows (no predicate), without their INCLUDE columns; a key part on
// an expression has no column.
const KEYS = `SELECT i.indexrelid::text AS "index", a.attname AS "column", a.attnotnull AS "isNotNull"
FROM pg_index i
CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, position)
LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
WHERE i.indrelid = $1 AND i.indisunique AND i.indisvalid AND i.indpred IS NULL
  AND k.position <= i.indnkeyatts
ORDER BY NOT i.indisprimary, i.indexrelid, k.position`

const OBJECT_ID = /^[1-9]\d*$/
const KINDS: ReadonlyMap<string, RelationKind> = new Map([
  ['r', RelationKind.Table],
  ['p', RelationKind.Table],
  ['v', RelationKind.View],
  ['m', RelationKind.MaterializedView],
  ['f', RelationKind.ForeignTable],
])
// A table that others inherit from (not a partitioned one) shows their rows too.
const ORDINARY_TABLE = 'r'

interface KeyPart {
  readonly index: string
  readonly column: string | undefined
}

// The connection of the session to a database, and its name.
export interface CatalogClient {
  readonly client: Client
  readonly database: string
}

export async function describeTable(
  { client, database }: CatalogClient,
  table: readonly string[],
): Promise<TableDescription | undefined> {
  const [id = ''] = table
  if (table.length !== 1 || !OBJECT_ID.test(id)) {
    return undefined
  }
  const [relation] = await queryRows(client, RELATION, [id])
  if (relation === undefined) {
    return undefined
  }
  const columns = await queryRows(client, COLUMNS, [id])
  const keys = await queryRows(client, KEYS, [id])
  return describedAs(relation, {
    database,
    columns: columns.map(readColumn).map(tableColumnOf),
    keys: keysOf(keys.map(readKeyPart)),
  })
}

// The table at a place of the catalog: its object number, then the description of describeTable.
export async function describeTableAt(
  target: CatalogClient,
  table: Pick<ObjectRef, 'name' | 'schema'>,
): Promise<TableDescription | undefined> {
  const [row] = await queryRows(target.client, RELATION_ID, [table.schema, table.name])
  return row === undefined ? undefined : describeTable(target, [readString(row, 'id')])
}

interface DescribedParts extends Pick<TableDescription, 'columns' | 'keys'> {
  readonly database: string
}

function describedAs(
  relation: JsonRecord,
  { database, ...parts }: DescribedParts,
): TableDescription {
  const kind = readString(relation, 'kind')
  const name = readString(relation, 'name')
  const schema = readString(relation, 'schema')
  const hasChildren = kind === ORDINARY_TABLE && readBoolean(relation, 'hasChildren')
  return {
    ref: { database, schema, name },
    kind: KINDS.get(kind) ?? RelationKind.Other,
    problem: hasChildren
      ? `Other tables inherit from "${name}": their rows show in it, and their keys may repeat. sqldoro does not edit it.`
      : '',
    ...parts,
  }
}

function readColumn(row: JsonRecord): PostgresColumn {
  const labels = readNullableString(row, 'labels')
  return {
    reference: readString(row, 'reference'),
    name: readString(row, 'name'),
    dataType: readString(row, 'dataType'),
    typeName: readString(row, 'typeName'),
    typeType: readString(row, 'typeType'),
    category: readString(row, 'category'),
    isNullable: readBoolean(row, 'isNullable'),
    hasDefault: readBoolean(row, 'hasDefault'),
    identity: readString(row, 'identity'),
    generated: readString(row, 'generated'),
    modifier: readNumber(row, 'modifier'),
    labels: labels === undefined ? [] : readLabels(labels),
  }
}

function readLabels(json: string): string[] {
  const labels: unknown = JSON.parse(json)
  if (!Array.isArray(labels) || !labels.every((label) => typeof label === 'string')) {
    throw new TypeError('PostgreSQL described the values of an enum type as something else')
  }
  return labels
}

// A key part whose column must refuse NULL; a part on an expression has none.
function readKeyPart(row: JsonRecord): KeyPart {
  const column = readNullableString(row, 'column')
  const isNotNull = column !== undefined && readBoolean(row, 'isNotNull')
  return { index: readString(row, 'index'), column: isNotNull ? column : undefined }
}

function keysOf(parts: readonly KeyPart[]): string[][] {
  const indexes = new Map<string, (string | undefined)[]>()
  for (const part of parts) {
    indexes.set(part.index, [...(indexes.get(part.index) ?? []), part.column])
  }
  return [...indexes.values()].filter(isComplete)
}

function isComplete(columns: readonly (string | undefined)[]): columns is string[] {
  return columns.every((column) => column !== undefined)
}
