import type { ObjectScope } from '../engine/catalog.ts'
import type { Dialect } from '../engine/dialect.ts'
import { bindingScope, type EditorBinding } from './binding.ts'

// Why the explorer marks a database: the SQL editor in front runs on it, or no SQL editor is in
// front and it is the default database of its connection.
export const SelectionSource = {
  Editor: 'editor',
  Default: 'default',
} as const

export type SelectionSource = (typeof SelectionSource)[keyof typeof SelectionSource]

// The database (and, where the engine has them, the schema) the explorer marks on a connection.
export interface SelectedScope extends ObjectScope {
  readonly connectionId: string
  readonly source: SelectionSource
}

export interface SelectableConnection {
  readonly id: string
  // The default database of the connection; empty for the server's.
  readonly database: string
  readonly dialect: Pick<Dialect, 'defaultSchema' | 'hasSchemas'>
}

// With a bound SQL editor in front, only its connection marks a database: the one the editor runs
// on. Without one (or bound to a connection that is gone), each connection marks its default
// database. A connection without a database of its own marks nothing.
export function selectedScopes(
  connections: readonly SelectableConnection[],
  front: EditorBinding | undefined,
): ReadonlyMap<string, SelectedScope> {
  const isFrontKnown = connections.some((connection) => connection.id === front?.connectionId)
  const known = isFrontKnown ? front : undefined
  return new Map(
    connections.flatMap((connection) => {
      const scope = scopeOf(connection, known)
      return scope === undefined ? [] : [[connection.id, scope] as const]
    }),
  )
}

function scopeOf(
  connection: SelectableConnection,
  front: EditorBinding | undefined,
): SelectedScope | undefined {
  if (front !== undefined && front.connectionId !== connection.id) {
    return undefined
  }
  const binding = bindingOf(connection, front)
  return binding.database === ''
    ? undefined
    : {
        connectionId: connection.id,
        source: sourceOf(front),
        ...bindingScope(binding, connection.dialect),
      }
}

// An editor without a database runs on the default one of its connection.
function bindingOf(
  connection: SelectableConnection,
  front: EditorBinding | undefined,
): EditorBinding {
  const binding = front ?? { connectionId: connection.id, database: '', schema: '' }
  return binding.database === '' ? { ...binding, database: connection.database } : binding
}

function sourceOf(front: EditorBinding | undefined): SelectionSource {
  return front === undefined ? SelectionSource.Default : SelectionSource.Editor
}

// The marks that appear, disappear or change between two selections: the old one and the new one
// of each connection whose mark changed.
export function changedScopes(
  before: ReadonlyMap<string, SelectedScope>,
  after: ReadonlyMap<string, SelectedScope>,
): SelectedScope[] {
  const ids = new Set([...before.keys(), ...after.keys()])
  return [...ids].flatMap((id) => {
    const old = before.get(id)
    const current = after.get(id)
    if (isSameScope(old, current)) {
      return []
    }
    return [old, current].filter((scope) => scope !== undefined)
  })
}

function isSameScope(left: SelectedScope | undefined, right: SelectedScope | undefined): boolean {
  return keyOf(left) === keyOf(right)
}

function keyOf(scope: SelectedScope | undefined): string {
  return JSON.stringify([scope?.database, scope?.schema, scope?.source])
}

// Whether a database or schema of the explorer shows the mark: a database holds it when the scope is
// in it, a schema when it is the scope.
export function showsScope(
  place: { readonly database: string; readonly schema: string; readonly isSchema: boolean },
  scope: SelectedScope,
): boolean {
  return place.database === scope.database && (!place.isSchema || place.schema === scope.schema)
}
