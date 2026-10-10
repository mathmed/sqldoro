import mysql, { type FieldPacket } from 'mysql2'

import { ColumnKind, type ColumnOrigin, type ResultColumn } from '../../core/engine/query.ts'

const UNKNOWN_TYPE = 'UNKNOWN'
// The character set MySQL gives binary strings (BINARY, VARBINARY, BLOB).
const BINARY_CHARSET = 63
// mysql2 maps each protocol type code to its name (3 -> LONG).
const TYPE_NAMES: ReadonlyMap<number, string> = new Map(
  Object.entries(mysql.Types).flatMap(([code, name]) =>
    typeof name === 'string' ? [[Number(code), name] as const] : [],
  ),
)
const KINDS: ReadonlyMap<string, ColumnKind> = new Map([
  ...[
    'DECIMAL',
    'NEWDECIMAL',
    'TINY',
    'SHORT',
    'LONG',
    'LONGLONG',
    'INT24',
    'FLOAT',
    'DOUBLE',
    'YEAR',
  ].map((name) => [name, ColumnKind.Number] as const),
  ...['TIMESTAMP', 'DATE', 'TIME', 'DATETIME', 'NEWDATE', 'TIMESTAMP2', 'DATETIME2', 'TIME2'].map(
    (name) => [name, ColumnKind.Temporal] as const,
  ),
  ...[
    'VARCHAR',
    'VAR_STRING',
    'STRING',
    'ENUM',
    'SET',
    'TINY_BLOB',
    'MEDIUM_BLOB',
    'LONG_BLOB',
    'BLOB',
  ].map((name) => [name, ColumnKind.Text] as const),
  ['JSON', ColumnKind.Json],
  ['BIT', ColumnKind.Binary],
  ['GEOMETRY', ColumnKind.Binary],
])

export function toResultColumn(field: FieldPacket): ResultColumn {
  const code = field.columnType ?? field.type
  const dataType = (code === undefined ? undefined : TYPE_NAMES.get(code)) ?? UNKNOWN_TYPE
  const column = { name: field.name, dataType, kind: kindOf(dataType, field.characterSet) }
  const origin = originOf(field)
  return origin === undefined ? column : { ...column, origin }
}

// A column of a table or a view is named by its database, table and column; the server leaves them
// empty for a computed value.
function originOf(field: FieldPacket): ColumnOrigin | undefined {
  const database = field.db ?? field.schema ?? ''
  const parts = [database, field.orgTable, field.orgName]
  if (parts.includes('')) {
    return undefined
  }
  return { table: [database, field.orgTable], column: field.orgName }
}

// Text and binary strings share their type codes: the binary character set tells them apart.
function kindOf(dataType: string, characterSet: number | undefined): ColumnKind {
  const kind = KINDS.get(dataType) ?? ColumnKind.Other
  return kind === ColumnKind.Text && characterSet === BINARY_CHARSET ? ColumnKind.Binary : kind
}
