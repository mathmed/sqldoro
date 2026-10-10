import pg, { type FieldDef } from 'pg'

import { ColumnKind, type ColumnOrigin, type ResultColumn } from '../../core/engine/query.ts'

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

type FieldDescription = Pick<FieldDef, 'columnID' | 'dataTypeID' | 'name' | 'tableID'>

export function toResultColumn(field: FieldDescription): ResultColumn {
  const dataType = TYPE_NAMES.get(field.dataTypeID) ?? UNKNOWN_TYPE
  const column = { name: field.name, dataType, kind: KINDS.get(dataType) ?? ColumnKind.Other }
  const origin = originOf(field)
  return origin === undefined ? column : { ...column, origin }
}

// A column of a table or a view is named by the object id of the relation and the number of the
// column in it; both are 0 for a computed value.
function originOf({ tableID, columnID }: FieldDescription): ColumnOrigin | undefined {
  return tableID > 0 && columnID > 0
    ? { table: [String(tableID)], column: String(columnID) }
    : undefined
}
