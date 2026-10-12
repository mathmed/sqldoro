import { WHERE_KEYWORDS, type WhereSource } from '../core/completion/where-completion.ts'
import type { ResultTab, SqlMessage } from '../core/results/protocol.ts'
import { RESERVED_WORDS, STANDARD_KEYWORDS } from '../core/sql/keywords.ts'
import type { LexicalRules } from '../core/sql/lexical-rules.ts'

export type SqlDialect = Omit<SqlMessage, 'type'>

// How the WHERE colors and completes the SQL of the connection.
export interface WhereSql {
  readonly source: WhereSource
  // The words colored as keywords, in upper case.
  readonly keywords: ReadonlySet<string>
}

// Until the host says how the SQL of the connection is written, the WHERE reads it the standard way.
const STANDARD_LEXICAL: LexicalRules = {
  stringQuotes: ["'"],
  identifierQuotes: ['"'],
  hasBackslashEscapes: false,
  hasEscapeStrings: false,
  hasDollarQuotes: false,
  hasHashComments: false,
  hasSpacedDashComments: false,
  hasNestedComments: false,
  hasExecutableComments: false,
  hasLowerCaseFolding: false,
}

export function lexicalOf(sql: SqlDialect | null): LexicalRules {
  return sql?.lexical ?? STANDARD_LEXICAL
}

// The words the WHERE colors as keywords, in upper case.
function keywordSet(sql: SqlDialect | null): ReadonlySet<string> {
  return new Set([
    ...STANDARD_KEYWORDS,
    ...RESERVED_WORDS,
    ...WHERE_KEYWORDS,
    ...(sql?.keywords ?? []).map((keyword) => keyword.toUpperCase()),
  ])
}

// What the WHERE of a table offers as it is typed: the columns of the table, the values of its
// enums, the keywords of a condition and those of the dialect.
function whereSource(tab: ResultTab, sql: SqlDialect | null): WhereSource {
  const lexical = lexicalOf(sql)
  return {
    columns: tab.columns.map(({ name }) => name),
    tables: [],
    choices: new Map(
      tab.columns.flatMap(({ name }, index) => {
        const choices = tab.meta.at(index)?.choices ?? []
        return choices.length === 0 ? [] : [[name, choices] as const]
      }),
    ),
    keywords: sql?.keywords ?? [],
    dialect: { identifierQuote: sql?.identifierQuote ?? '"', lexical },
  }
}

export function whereSql(tab: ResultTab, sql: SqlDialect | null): WhereSql {
  return { source: whereSource(tab, sql), keywords: keywordSet(sql) }
}

// What the query box of a table panel offers beside: the tables and views of the schema, and the
// keywords of whole statements (SELECT, FROM, JOIN...).
export function boxSql(
  tab: ResultTab,
  { sql, tables }: { readonly sql: SqlDialect | null; readonly tables: readonly string[] },
): WhereSql {
  const where = whereSql(tab, sql)
  const keywords = [...STANDARD_KEYWORDS, ...where.source.keywords]
  return { ...where, source: { ...where.source, tables, keywords } }
}
