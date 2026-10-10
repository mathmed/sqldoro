import pg, { type FieldDef } from 'pg'

import { ColumnKind, type ResultColumn } from '../../core/engine/query.ts'

const UNKNOWN_TYPE = 'UNKNOWN'
const TYPE_NAMES: ReadonlyMap<number, string> = new Map(
  Object.entries(pg.types.builtins).map(([name, oid]) => [oid, name]),
)
const KINDS: ReadonlyMap<string, ColumnKind> = new Map([
  ...['INT2', 'INT4', 'INT8', 'NUMERIC', 'FLOAT4', 'FLOAT8', 'OID'].map(
    (name) => [name, ColumnKind.Number] as const,
  ),
  ...['DATE', 'TIME', 'TIMETZ', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL'].map(
    (name) => [name, ColumnKind.Temporal] as const,
  ),
  ...['TEXT', 'VARCHAR', 'BPCHAR', 'CHAR', 'NAME', 'UUID', 'XML'].map(
    (name) => [name, ColumnKind.Text] as const,
  ),
  ['BOOL', ColumnKind.Boolean],
  ['JSON', ColumnKind.Json],
  ['JSONB', ColumnKind.Json],
  ['BYTEA', ColumnKind.Binary],
])

export function toResultColumn(field: Pick<FieldDef, 'dataTypeID' | 'name'>): ResultColumn {
  const dataType = TYPE_NAMES.get(field.dataTypeID) ?? UNKNOWN_TYPE
  return { name: field.name, dataType, kind: KINDS.get(dataType) ?? ColumnKind.Other }
}
