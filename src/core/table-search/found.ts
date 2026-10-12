import type { ObjectScope } from '../engine/catalog.ts'
import { compareMatches, type Highlight, matchName, type NameMatch } from '../text/fuzzy.ts'

// The tables and views of a namespace (a schema, or a MySQL database), as the index holds them.
export interface IndexedScope {
  readonly scope: ObjectScope
  readonly tables: readonly string[]
  readonly views: readonly string[]
}

// What the index holds of a connected connection: the namespaces loaded so far.
export interface IndexedConnection {
  readonly connectionId: string
  // Its databases hold schemas (PostgreSQL); otherwise a database is the namespace (MySQL).
  readonly hasSchemas: boolean
  readonly isLoading: boolean
  readonly scopes: readonly IndexedScope[]
}

export const FoundKind = {
  Connection: 'connection',
  Database: 'database',
  Schema: 'schema',
  Tables: 'tables',
  Views: 'views',
  Table: 'table',
  View: 'view',
} as const

export type FoundKind = (typeof FoundKind)[keyof typeof FoundKind]

// A node of the tree of what was found: a connection, database, schema, group (Tables, Views) or
// a table or view whose name matches the text. Its key is the same for the same node whatever the
// text, and shaped like the ids of the explorer: [kind, connection id, ...path].
export interface FoundBranch {
  readonly key: string
  readonly kind: FoundKind
  readonly connectionId: string
  // Where the node is: the database and the schema (the database again in MySQL, empty for a
  // connection, and an empty schema for a PostgreSQL database).
  readonly scope: ObjectScope
  // The name of a database, schema, table or view; empty for a connection or a group.
  readonly name: string
  // How many tables or views a group holds; 0 for the other nodes.
  readonly count: number
  // Where the text is in the name of a table or view.
  readonly highlights: readonly Highlight[]
  // How the name of a table or view matches the text.
  readonly match?: NameMatch
  readonly children: readonly FoundBranch[]
}

// A connection of the tree, with what the index gave of it.
export interface FoundConnection<C extends IndexedConnection> extends FoundBranch {
  readonly source: C
}

export interface FoundTables<C extends IndexedConnection = IndexedConnection> {
  // The text searched, trimmed: empty finds nothing.
  readonly text: string
  readonly roots: readonly FoundConnection<C>[]
  readonly matchCount: number
  // The table or view that matches best, the first of the tree among equals: Enter opens it.
  readonly bestKey: string | undefined
  // How many connections were searched: the connected ones.
  readonly connectionCount: number
  // Whether the tables of a connection are still loading.
  readonly isLoading: boolean
}

export const NOTHING_FOUND: FoundTables = {
  text: '',
  roots: [],
  matchCount: 0,
  bestKey: undefined,
  connectionCount: 0,
  isLoading: false,
}

const NO_SCOPE: ObjectScope = { database: '', schema: '' }

// The tables and views whose name matches the text (matchName: whole, over the starts of its words,
// or its characters in order, whatever the case) under their connection, database, schema and
// group, in the order of the index; in a group, the best matches first. Pure and in memory: it runs
// on every keystroke.
export function findTables<C extends IndexedConnection>(
  connections: readonly C[],
  text: string,
): FoundTables<C> {
  const needle = text.trim()
  // An empty text matches nothing, so it finds nothing.
  const roots = connections.flatMap((source) => foundConnection(source, needle))
  return {
    text: needle,
    roots,
    matchCount: roots.reduce((total, root) => total + matchesIn(root), 0),
    bestKey: bestOf(roots),
    connectionCount: connections.length,
    isLoading: connections.some(({ isLoading }) => isLoading),
  }
}

interface Matched {
  readonly key: string
  readonly match: NameMatch
}

function matchedIn(branches: readonly FoundBranch[]): Matched[] {
  return branches.flatMap(({ key, match, children }) =>
    match === undefined ? matchedIn(children) : [{ key, match }],
  )
}

function bestOf(roots: readonly FoundBranch[]): string | undefined {
  return matchedIn(roots).toSorted((first, second) => compareMatches(first.match, second.match))[0]
    ?.key
}

function matchesIn(found: FoundBranch): number {
  return found.children.reduce((total, child) => total + matchesIn(child), found.count)
}

function keyOf(kind: FoundKind, connectionId: string, path: readonly string[]): string {
  return JSON.stringify([kind, connectionId, ...path])
}

interface Place {
  readonly connectionId: string
  readonly scope: ObjectScope
}

function newBranch(
  kind: FoundKind,
  { connectionId, scope }: Place,
  parts: Pick<FoundBranch, 'name' | 'children'> & { readonly path: readonly string[] },
): FoundBranch {
  return {
    key: keyOf(kind, connectionId, parts.path),
    kind,
    connectionId,
    scope,
    name: parts.name,
    count: 0,
    highlights: [],
    children: parts.children,
  }
}

function foundConnection<C extends IndexedConnection>(
  source: C,
  needle: string,
): FoundConnection<C>[] {
  const scopes = source.scopes.flatMap((scope) => foundScope(source.connectionId, scope, needle))
  if (scopes.length === 0) {
    return []
  }
  const place = { connectionId: source.connectionId, scope: NO_SCOPE }
  const children = databasesOf(scopes).map((database) =>
    foundDatabase(source, {
      database,
      scopes: scopes.filter(({ scope }) => scope.database === database),
    }),
  )
  return [{ ...newBranch(FoundKind.Connection, place, { name: '', path: [], children }), source }]
}

// A namespace that holds a match, with its groups.
interface ScopeGroups {
  readonly scope: ObjectScope
  readonly groups: readonly FoundBranch[]
}

function databasesOf(scopes: readonly ScopeGroups[]): string[] {
  return [...new Set(scopes.map(({ scope }) => scope.database))]
}

interface DatabaseScopes {
  readonly database: string
  readonly scopes: readonly ScopeGroups[]
}

function foundDatabase(
  { connectionId, hasSchemas }: IndexedConnection,
  { database, scopes }: DatabaseScopes,
): FoundBranch {
  const children = hasSchemas
    ? scopes.map(({ scope, groups }) =>
        newBranch(
          FoundKind.Schema,
          { connectionId, scope },
          { name: scope.schema, path: [scope.database, scope.schema], children: groups },
        ),
      )
    : scopes.flatMap(({ groups }) => groups)
  const scope = { database, schema: hasSchemas ? '' : database }
  return newBranch(
    FoundKind.Database,
    { connectionId, scope },
    { name: database, path: [database], children },
  )
}

function foundScope(connectionId: string, indexed: IndexedScope, needle: string): ScopeGroups[] {
  const place = { connectionId, scope: indexed.scope }
  const groups = [
    ...foundGroup(place, { kind: FoundKind.Tables, names: indexed.tables }, needle),
    ...foundGroup(place, { kind: FoundKind.Views, names: indexed.views }, needle),
  ]
  return groups.length === 0 ? [] : [{ scope: indexed.scope, groups }]
}

interface Group {
  readonly kind: typeof FoundKind.Tables | typeof FoundKind.Views
  readonly names: readonly string[]
}

function foundGroup(place: Place, { kind, names }: Group, needle: string): FoundBranch[] {
  const objectKind = kind === FoundKind.Tables ? FoundKind.Table : FoundKind.View
  const path = [place.scope.database, place.scope.schema]
  const children = names
    .flatMap((name) => {
      const match = matchName(name, needle)
      return match === undefined ? [] : [{ name, match }]
    })
    .toSorted((first, second) => compareMatches(first.match, second.match))
    .map(({ name, match }) => ({
      ...newBranch(objectKind, place, { name, path: [...path, name], children: [] }),
      highlights: match.highlights,
      match,
    }))
  if (children.length === 0) {
    return []
  }
  return [{ ...newBranch(kind, place, { name: '', path, children }), count: children.length }]
}
