import type { ObjectScope } from '../engine/catalog.ts'
import type { Dialect } from '../engine/dialect.ts'
import { readRecord, readString } from '../json/record.ts'
import type { ListFormat } from '../json/versioned-list.ts'

// The connection a SQL editor runs its statements on, and the database and schema they run in
// (empty: the default of the connection).
export interface EditorBinding {
  readonly connectionId: string
  readonly database: string
  readonly schema: string
}

export interface StoredBinding extends EditorBinding {
  readonly uri: string
}

const SEPARATOR = ' › '

export const BINDING_FORMAT: ListFormat<StoredBinding> = {
  version: 1,
  key: 'bindings',
  listName: 'editor connections',
  entryName: 'Editor connection',
  decode: (value) => {
    const record = readRecord(value)
    return {
      uri: readString(record, 'uri'),
      connectionId: readString(record, 'connectionId'),
      database: readString(record, 'database'),
      schema: readString(record, 'schema'),
    }
  },
}

// Where unqualified names resolve: in MySQL the schema is the database; in PostgreSQL an editor
// without a schema works in the default one.
export function bindingScope(
  binding: EditorBinding,
  dialect: Pick<Dialect, 'defaultSchema' | 'hasSchemas'>,
): ObjectScope {
  if (!dialect.hasSchemas) {
    return { database: binding.database, schema: binding.database }
  }
  return {
    database: binding.database,
    schema: binding.schema === '' ? dialect.defaultSchema : binding.schema,
  }
}

// "Shop › shop.public", "Shop › shop", or the connection alone.
export function describeBinding(
  connectionName: string,
  scope: ObjectScope,
  hasSchemas: boolean,
): string {
  if (scope.database === '') {
    return connectionName
  }
  const where =
    hasSchemas && scope.schema !== '' ? `${scope.database}.${scope.schema}` : scope.database
  return `${connectionName}${SEPARATOR}${where}`
}
