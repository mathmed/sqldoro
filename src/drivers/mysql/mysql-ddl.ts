import type { Connection } from 'mysql2'

import { ObjectKind, type ObjectRef } from '../../core/engine/catalog.ts'
import { qualifiedName, quoteIdentifier } from '../../core/engine/dialect.ts'
import { readString } from '../../core/json/record.ts'
import { queryRows, runQuery } from './mysql-catalog.ts'
import { MYSQL_DIALECT } from './mysql-dialect.ts'

interface Shown {
  readonly keyword: string
  readonly column: string
}

// SHOW CREATE answers with the name of the object and its statement, in a column named after it.
const TABLE: Shown = { keyword: 'TABLE', column: 'Create Table' }
const VIEW: Shown = { keyword: 'VIEW', column: 'Create View' }

// Identifiers cannot be bound values: they are quoted.
export async function objectDdl(
  connection: Connection,
  object: ObjectRef,
  kind: ObjectKind,
): Promise<string> {
  const shown = kind === ObjectKind.View ? VIEW : TABLE
  const name = qualifiedName(MYSQL_DIALECT, [object.schema, object.name])
  const [row] = await queryRows(connection, `SHOW CREATE ${shown.keyword} ${name}`, [])
  if (row === undefined) {
    throw new Error(`MySQL did not show the definition of ${object.name}`)
  }
  return `${readString(row, shown.column)};`
}

// An empty database keeps the default one of the connection.
export async function useDatabase(connection: Connection, database: string): Promise<void> {
  if (database !== '') {
    await runQuery(connection, `USE ${quoteIdentifier(MYSQL_DIALECT, database)}`, [])
  }
}
