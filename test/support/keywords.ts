// What the autocomplete of an SQL editor offers where a statement starts, for the tests of the
// dialects: every statement the classifier knows should start with a word it offers.
import { expect } from 'vitest'

import { NO_NEEDS } from '../../src/core/completion/catalog-needs.ts'
import { completionAt } from '../../src/core/completion/context.ts'
import { buildSuggestions } from '../../src/core/completion/suggestions.ts'
import type { Dialect } from '../../src/core/engine/dialect.ts'
import { classifyStatement } from '../../src/core/safety/classify.ts'
import { StatementCategory } from '../../src/core/safety/statement-class.ts'

const EMPTY_CATALOG = { databases: [], schemas: [], objects: new Map(), columns: new Map() }
const FIRST_WORD = /^\S+/u

function offeredKeywords(dialect: Dialect): ReadonlySet<string> {
  const { context } = completionAt('', 0, dialect.lexical)
  const { items } = buildSuggestions({ context, needs: NO_NEEDS, catalog: EMPTY_CATALOG }, dialect)
  return new Set(items.map((item) => item.label))
}

// Each statement is one the classifier knows, and the autocomplete offers its first word and the
// other words given.
export function expectCompleted(
  dialect: Dialect,
  {
    statements,
    words,
  }: { readonly statements: readonly string[]; readonly words: readonly string[] },
): void {
  const offered = offeredKeywords(dialect)
  const unknown = statements.filter(
    (sql) => classifyStatement(sql, dialect).category === StatementCategory.Unknown,
  )
  const firstWords = statements.map((sql) => FIRST_WORD.exec(sql)?.[0] ?? sql)
  expect(unknown).toStrictEqual([])
  expect([...firstWords, ...words].filter((word) => !offered.has(word))).toStrictEqual([])
}
