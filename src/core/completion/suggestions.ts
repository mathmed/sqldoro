import type { ColumnInfo, ObjectRef, ObjectScope } from '../engine/catalog.ts'
import { type Dialect, quoteIdentifier } from '../engine/dialect.ts'
import { RESERVED_WORDS, STANDARD_KEYWORDS } from '../sql/keywords.ts'
import { type CatalogNeeds, type LoadedCatalog, objectKey, scopeKey } from './catalog-needs.ts'
import { Clause, type CompletionContext } from './context.ts'

export const SuggestionKind = {
  Column: 'column',
  Alias: 'alias',
  Table: 'table',
  View: 'view',
  Schema: 'schema',
  Database: 'database',
  Keyword: 'keyword',
} as const

export type SuggestionKind = (typeof SuggestionKind)[keyof typeof SuggestionKind]

export interface Suggestion {
  readonly label: string
  readonly kind: SuggestionKind
  readonly detail: string
  readonly insertText: string
  readonly filterText: string
  readonly sortText: string
}

export interface Suggestions {
  readonly items: readonly Suggestion[]
  // More would match: the editor asks again as the user types.
  readonly isIncomplete: boolean
}

type SuggestionDialect = Pick<Dialect, 'identifierQuote' | 'keywords' | 'lexical'>

// Names come first, then keywords: the closer to the cursor, the higher.
const SORT_GROUPS: ReadonlyMap<SuggestionKind, string> = new Map([
  [SuggestionKind.Column, 'a'],
  [SuggestionKind.Alias, 'b'],
  [SuggestionKind.Table, 'c'],
  [SuggestionKind.View, 'c'],
  [SuggestionKind.Schema, 'd'],
  [SuggestionKind.Database, 'd'],
  [SuggestionKind.Keyword, 'z'],
])
// Large schemas would flood the editor: past this many, only the names that start with what was
// typed are offered.
export const MAX_SUGGESTIONS = 2000
const SIMPLE_NAME = /^[A-Za-z_][\w$]*$/

interface NameSpec {
  readonly name: string
  readonly kind: SuggestionKind
  readonly detail: string
}

export function needsQuoting(name: string, dialect: Pick<Dialect, 'lexical'>): boolean {
  if (!SIMPLE_NAME.test(name) || RESERVED_WORDS.has(name.toUpperCase())) {
    return true
  }
  return dialect.lexical.hasLowerCaseFolding && name !== name.toLowerCase()
}

export interface SuggestionSource {
  readonly context: CompletionContext
  readonly needs: CatalogNeeds
  readonly catalog: LoadedCatalog
}

export function buildSuggestions(
  { context, needs, catalog }: SuggestionSource,
  dialect: SuggestionDialect,
): Suggestions {
  if (context.isInText) {
    return { items: [], isIncomplete: false }
  }
  const names = [...catalogNames(needs, catalog), ...aliasNames(context)].map((spec) =>
    nameSuggestion(spec, context, dialect),
  )
  const hasKeywords = context.qualifier.length === 0 && !context.isQuoted
  const keywords = hasKeywords ? keywordSuggestions(context.prefix, dialect) : []
  return limited([...names, ...keywords], context.prefix)
}

function catalogNames(needs: CatalogNeeds, catalog: LoadedCatalog): NameSpec[] {
  return [
    ...(needs.hasDatabases ? named(catalog.databases, SuggestionKind.Database, 'database') : []),
    ...(needs.schemasOf === undefined
      ? []
      : named(catalog.schemas, SuggestionKind.Schema, 'schema')),
    ...needs.scopes.flatMap((scope) => objectNames(scope, catalog)),
    ...needs.tables.flatMap((table) => columnNames(table, catalog)),
  ]
}

function named(names: readonly string[], kind: SuggestionKind, detail: string): NameSpec[] {
  return names.map((name) => ({ name, kind, detail }))
}

function objectNames(scope: ObjectScope, catalog: LoadedCatalog): NameSpec[] {
  const objects = catalog.objects.get(scopeKey(scope))
  if (objects === undefined) {
    return []
  }
  return [
    ...named(objects.tables, SuggestionKind.Table, `table in ${scope.schema}`),
    ...named(objects.views, SuggestionKind.View, `view in ${scope.schema}`),
  ]
}

function columnNames(table: ObjectRef, catalog: LoadedCatalog): NameSpec[] {
  const columns: readonly ColumnInfo[] = catalog.columns.get(objectKey(table)) ?? []
  return columns.map((column) => ({
    name: column.name,
    kind: SuggestionKind.Column,
    detail: `${column.dataType} · ${table.name}`,
  }))
}

// Where columns go, the aliases and tables of the statement are offered to start "alias.".
function aliasNames(context: CompletionContext): NameSpec[] {
  if (context.clause !== Clause.Column || context.qualifier.length > 0) {
    return []
  }
  return context.references.flatMap(({ parts, alias }) =>
    (alias === undefined ? parts.slice(-1) : [alias]).map((name) => ({
      name,
      kind: SuggestionKind.Alias,
      detail: parts.join('.'),
    })),
  )
}

function nameSuggestion(
  spec: NameSpec,
  context: CompletionContext,
  dialect: SuggestionDialect,
): Suggestion {
  const shouldQuote = context.isQuoted || needsQuoting(spec.name, dialect)
  const insertText = shouldQuote ? quoteIdentifier(dialect, spec.name) : spec.name
  return {
    label: spec.name,
    kind: spec.kind,
    detail: spec.detail,
    insertText,
    filterText: context.isQuoted ? insertText : spec.name,
    sortText: sortText(spec.kind, spec.name),
  }
}

function keywordSuggestions(prefix: string, dialect: SuggestionDialect): Suggestion[] {
  const keywords = new Set([...STANDARD_KEYWORDS, ...dialect.keywords.map((k) => k.toUpperCase())])
  const isLowerCase = prefix !== prefix.toUpperCase() && prefix === prefix.toLowerCase()
  return [...keywords].map((keyword) => {
    const text = isLowerCase ? keyword.toLowerCase() : keyword
    return {
      label: keyword,
      kind: SuggestionKind.Keyword,
      detail: 'keyword',
      insertText: text,
      filterText: text,
      sortText: sortText(SuggestionKind.Keyword, keyword),
    }
  })
}

function sortText(kind: SuggestionKind, name: string): string {
  return `${String(SORT_GROUPS.get(kind))}${name.toLowerCase()}`
}

function limited(items: readonly Suggestion[], prefix: string): Suggestions {
  if (items.length <= MAX_SUGGESTIONS) {
    return { items, isIncomplete: false }
  }
  const start = prefix.toLowerCase()
  const matching = items.filter((item) => item.label.toLowerCase().startsWith(start))
  return { items: matching.slice(0, MAX_SUGGESTIONS), isIncomplete: true }
}
