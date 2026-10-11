import * as vscode from 'vscode'

import type { EditorBinding } from '../../core/editor/binding.ts'
import type { ObjectRef } from '../../core/engine/catalog.ts'
import { readRecord, readString } from '../../core/json/record.ts'

export const TABLE_SCHEME = 'sqldoro-table'

// A table or view of the explorer, and the connection that listed it.
export interface TableTarget {
  readonly connectionId: string
  readonly table: ObjectRef
  // Tells apart the panels a navigation opens on the same table; empty for the panel the explorer
  // opens.
  readonly instance: string
}

// The key of the panel with the rows of a table, as the editor URI is the key of an editor's: it
// names the connection, the database, the schema and the table (and the instance of a panel a
// navigation opened), so that the same table always finds the same panel, session and transaction.
// It holds no value of any row: URIs reach the log.
export function tableUri({ connectionId, table, instance }: TableTarget): vscode.Uri {
  const query = JSON.stringify({
    connectionId,
    database: table.database,
    schema: table.schema,
    name: table.name,
    instance,
  })
  return vscode.Uri.from({ scheme: TABLE_SCHEME, path: `/${table.name}`, query })
}

// The keys of table panels, as the sessions and transactions of sources know them (uri.toString()).
export function isTableKey(key: string): boolean {
  return key.startsWith(`${TABLE_SCHEME}:`)
}

// The table a URI names; undefined for any other source. Only sqldoro makes these URIs: they are
// read field by field all the same.
export function tableTargetOf(uri: vscode.Uri): TableTarget | undefined {
  if (uri.scheme !== TABLE_SCHEME) {
    return undefined
  }
  const record = readRecord(JSON.parse(uri.query))
  return {
    connectionId: readString(record, 'connectionId'),
    table: {
      database: readString(record, 'database'),
      schema: readString(record, 'schema'),
      name: readString(record, 'name'),
    },
    instance: readString(record, 'instance'),
  }
}

// A table panel runs on the connection, database and schema of its table.
export function tableBinding(uri: vscode.Uri): EditorBinding | undefined {
  const target = tableTargetOf(uri)
  return target === undefined
    ? undefined
    : {
        connectionId: target.connectionId,
        database: target.table.database,
        schema: target.table.schema,
      }
}
