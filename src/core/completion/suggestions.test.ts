import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import type { Dialect } from '../engine/dialect.ts'
import { STANDARD_KEYWORDS } from '../sql/keywords.ts'
import { catalogNeeds, type LoadedCatalog, objectKey, scopeKey } from './catalog-needs.ts'
import { analyzeCompletion } from './context.ts'
import {
  buildSuggestions,
  MAX_SUGGESTIONS,
  needsQuoting,
  type Suggestion,
  type Suggestions,
} from './suggestions.ts'

const SCOPE = { database: 'shop', schema: 'public' }
const EMPTY: LoadedCatalog = {
  databases: [],
  schemas: [],
  objects: new Map(),
  columns: new Map(),
}
const CATALOG: LoadedCatalog = {
  databases: ['shop', 'crm'],
  schemas: ['public', 'Sales'],
  objects: new Map([[scopeKey(SCOPE), { tables: ['orders', 'Order Lines'], views: ['totals'] }]]),
  columns: new Map([
    [
      objectKey({ ...SCOPE, name: 'orders' }),
      [
        {
          name: 'id',
          dataType: 'bigint',
          isNullable: false,
          defaultValue: undefined,
          isPrimaryKey: true,
        },
        {
          name: 'order',
          dataType: 'text',
          isNullable: true,
          defaultValue: undefined,
          isPrimaryKey: false,
        },
      ],
    ],
  ]),
}

function suggest(
  sqlWithCursor: string,
  catalog: LoadedCatalog = CATALOG,
  dialect: Dialect = POSTGRES_DIALECT,
): Suggestions {
  const offset = sqlWithCursor.indexOf('|')
  const context = analyzeCompletion(sqlWithCursor.replace('|', ''), offset, dialect.lexical)
  const scope = dialect.hasSchemas ? SCOPE : { database: 'shop', schema: 'shop' }
  return buildSuggestions(
    { context, needs: catalogNeeds(context, scope, dialect), catalog },
    dialect,
  )
}

function names(suggestions: Suggestions): string[] {
  return suggestions.items
    .filter((suggestion) => suggestion.kind !== 'keyword')
    .map((suggestion) => `${suggestion.kind}:${suggestion.label}`)
}

function item(suggestions: Suggestions, label: string): Suggestion | undefined {
  return suggestions.items.find((candidate) => candidate.label === label)
}

describe('needsQuoting', () => {
  it('should quote names that are not simple identifiers or that are reserved', () => {
    expect(needsQuoting('order lines', MYSQL_DIALECT)).toBe(true)
    expect(needsQuoting('1abc', MYSQL_DIALECT)).toBe(true)
    expect(needsQuoting('select', MYSQL_DIALECT)).toBe(true)
    expect(needsQuoting('Orders_2$', MYSQL_DIALECT)).toBe(false)
  })

  it('should quote names with upper case where unquoted names fold to lower case', () => {
    expect(needsQuoting('Orders', POSTGRES_DIALECT)).toBe(true)
    expect(needsQuoting('orders', POSTGRES_DIALECT)).toBe(false)
  })
})

describe('buildSuggestions', () => {
  it('should offer nothing in text', () => {
    expect(suggest("SELECT 'a|")).toStrictEqual({ items: [], isIncomplete: false })
  })

  it('should offer the schemas, tables and views where tables go, then the keywords', () => {
    const sut = suggest('SELECT * FROM |')

    expect(names(sut)).toStrictEqual([
      'schema:public',
      'schema:Sales',
      'table:orders',
      'table:Order Lines',
      'view:totals',
    ])
    expect(sut.items.filter((candidate) => candidate.kind === 'keyword')).toHaveLength(
      STANDARD_KEYWORDS.length + 2,
    )
    expect(sut.isIncomplete).toBe(false)
  })

  it('should describe each suggestion and sort names before keywords', () => {
    const sut = suggest('SELECT | FROM orders o')

    expect(item(sut, 'id')).toStrictEqual({
      label: 'id',
      kind: 'column',
      detail: 'bigint · orders',
      insertText: 'id',
      filterText: 'id',
      sortText: 'aid',
    })
    expect(item(sut, 'o')).toStrictEqual({
      label: 'o',
      kind: 'alias',
      detail: 'orders',
      insertText: 'o',
      filterText: 'o',
      sortText: 'bo',
    })
    expect(item(suggest('SELECT * FROM |'), 'orders')).toMatchObject({
      detail: 'table in public',
      sortText: 'corders',
    })
    expect(item(suggest('SELECT * FROM |'), 'totals')).toMatchObject({
      detail: 'view in public',
      sortText: 'ctotals',
    })
    expect(item(suggest('SELECT * FROM |'), 'Sales')).toMatchObject({
      detail: 'schema',
      sortText: 'dsales',
    })
    expect(item(sut, 'SELECT')).toStrictEqual({
      label: 'SELECT',
      kind: 'keyword',
      detail: 'keyword',
      insertText: 'SELECT',
      filterText: 'SELECT',
      sortText: 'zselect',
    })
  })

  it('should offer the databases in MySQL', () => {
    expect(names(suggest('SELECT * FROM |', CATALOG, MYSQL_DIALECT))).toContain('database:crm')
    expect(item(suggest('SELECT * FROM |', CATALOG, MYSQL_DIALECT), 'crm')).toMatchObject({
      detail: 'database',
      sortText: 'dcrm',
    })
  })

  it('should quote the names that need it', () => {
    const sut = suggest('SELECT * FROM |')

    expect(item(sut, 'Order Lines')).toMatchObject({
      insertText: '"Order Lines"',
      filterText: 'Order Lines',
    })
    expect(item(sut, 'Sales')?.insertText).toBe('"Sales"')
    expect(item(suggest('SELECT | FROM orders'), 'order')?.insertText).toBe('"order"')
  })

  it('should quote every name, and filter with the quote, inside an opened quote', () => {
    expect(item(suggest('SELECT * FROM "or|'), 'orders')).toMatchObject({
      insertText: '"orders"',
      filterText: '"orders"',
    })
  })

  it('should offer no keyword after a qualifier or inside a quote', () => {
    expect(
      suggest('SELECT o.| FROM orders o').items.map((candidate) => candidate.label),
    ).toStrictEqual(['id', 'order'])
    expect(
      suggest('SELECT * FROM "|').items.every((candidate) => candidate.kind !== 'keyword'),
    ).toBe(true)
  })

  it('should offer aliases only where columns go and without a qualifier', () => {
    expect(names(suggest('SELECT * FROM orders o JOIN |'))).not.toContain('alias:o')
    expect(names(suggest('SELECT x.| FROM orders o'))).not.toContain('alias:o')
    expect(names(suggest('SELECT | FROM orders'))).toContain('alias:orders')
  })

  it('should write keywords in lower case when the prefix is in lower case', () => {
    expect(item(suggest('sel|'), 'SELECT')).toMatchObject({
      insertText: 'select',
      filterText: 'select',
    })
    expect(item(suggest('Sel|'), 'SELECT')?.insertText).toBe('SELECT')
    expect(item(suggest('|'), 'SELECT')?.insertText).toBe('SELECT')
    expect(item(suggest('_|'), 'SELECT')?.insertText).toBe('SELECT')
  })

  it('should offer the keywords of the dialect in upper case, once each', () => {
    const labels = suggest('|', EMPTY, MYSQL_DIALECT).items.map((candidate) => candidate.label)

    expect(labels).toContain('DESCRIBE')
    expect(labels.filter((label) => label === 'SHOW')).toHaveLength(1)
  })

  it('should offer nothing from the catalog for what is not loaded', () => {
    expect(names(suggest('SELECT * FROM |', EMPTY))).toStrictEqual([])
    expect(names(suggest('SELECT | FROM missing', EMPTY))).toStrictEqual(['alias:missing'])
  })

  it('should offer only the names that start with the prefix past the limit, and ask again', () => {
    const tables = Array.from(
      { length: MAX_SUGGESTIONS + 10 },
      (...[, index]) => `t${String(index)}`,
    )
    const catalog = { ...EMPTY, objects: new Map([[scopeKey(SCOPE), { tables, views: [] }]]) }

    const sut = suggest('SELECT * FROM T1|', catalog)

    expect(sut.isIncomplete).toBe(true)
    expect(sut.items.length).toBeLessThanOrEqual(MAX_SUGGESTIONS)
    expect(sut.items.every((candidate) => candidate.label.toLowerCase().startsWith('t1'))).toBe(
      true,
    )
    expect(sut.items.some((candidate) => candidate.label === 't1999')).toBe(true)
  })

  it('should keep every suggestion at the limit', () => {
    const tables = Array.from(
      { length: MAX_SUGGESTIONS - STANDARD_KEYWORDS.length - 2 - 2 },
      (...[, index]) => `t${String(index)}`,
    )
    const catalog = {
      ...EMPTY,
      schemas: ['a', 'b'],
      objects: new Map([[scopeKey(SCOPE), { tables, views: [] }]]),
    }

    const sut = suggest('SELECT * FROM |', catalog)

    expect(sut.items).toHaveLength(MAX_SUGGESTIONS)
    expect(sut.isIncomplete).toBe(false)
  })

  it('should work with the tokens of the statement only', () => {
    expect(analyzeCompletion('SELECT 1', 8, POSTGRES_LEXICAL).prefix).toBe('')
  })
})
