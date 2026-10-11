import { describe, expect, it } from 'vitest'

import { MatchRank } from '../text/fuzzy.ts'
import { foundChanges } from './changes.ts'
import { findTables, type FoundBranch, type IndexedConnection, NOTHING_FOUND } from './found.ts'

const SHOP: IndexedConnection = {
  connectionId: 'shop',
  hasSchemas: true,
  isLoading: false,
  scopes: [
    {
      scope: { database: 'shop', schema: 'sales' },
      tables: ['orders', 'lines', 'Order_Items'],
      views: ['order_totals'],
    },
    { scope: { database: 'shop', schema: 'audit' }, tables: ['events'], views: [] },
    { scope: { database: 'shop', schema: 'archive' }, tables: ['old_orders'], views: [] },
  ],
}
const CRM: IndexedConnection = {
  connectionId: 'crm',
  hasSchemas: false,
  isLoading: true,
  scopes: [
    { scope: { database: 'crm', schema: 'crm' }, tables: ['leads'], views: ['lead_orders'] },
    { scope: { database: 'billing', schema: 'billing' }, tables: ['invoices'], views: [] },
  ],
}
// A frame of a 60 Hz screen: filtering must take well less than this.
const FRAME_MS = 16
const LARGE_SCOPES = 30
const TABLES_PER_SCOPE = 100
const RUNS = 5

function outline(branches: readonly FoundBranch[], depth = 0): string[] {
  return branches.flatMap((branch) => [
    `${'  '.repeat(depth)}${branch.kind} ${branch.name}`.trimEnd(),
    ...outline(branch.children, depth + 1),
  ])
}

function leavesOf(branches: readonly FoundBranch[]): FoundBranch[] {
  return branches.flatMap((branch) =>
    branch.children.length === 0 ? [branch] : leavesOf(branch.children),
  )
}

// The first child at each level, from the top.
function firstPath(branches: readonly FoundBranch[]): FoundBranch[] {
  const [first] = branches
  return first === undefined ? [] : [first, ...firstPath(first.children)]
}

// A server of several thousand tables, as a large production schema has.
function largeIndex(): IndexedConnection[] {
  return [
    {
      connectionId: 'big',
      hasSchemas: true,
      isLoading: false,
      scopes: Array.from({ length: LARGE_SCOPES }, (...[, scope]) => ({
        scope: { database: 'big', schema: `schema_${String(scope)}` },
        tables: Array.from(
          { length: TABLES_PER_SCOPE },
          (...[, table]) => `customer_order_history_${String(scope)}_${String(table)}`,
        ),
        views: [`report_${String(scope)}`],
      })),
    },
  ]
}

function bestTime(run: () => void): number {
  let best = Number.POSITIVE_INFINITY
  for (let attempt = 0; attempt < RUNS; attempt += 1) {
    const started = performance.now()
    run()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

describe('findTables', () => {
  it('should open the connections down to the tables and views whose name holds the text', () => {
    const sut = findTables([SHOP, CRM], ' ORD ')

    expect(outline(sut.roots)).toStrictEqual([
      'connection',
      '  database shop',
      '    schema sales',
      '      tables',
      '        table orders',
      '        table Order_Items',
      '      views',
      '        view order_totals',
      '    schema archive',
      '      tables',
      '        table old_orders',
      'connection',
      '  database crm',
      '    views',
      '      view lead_orders',
    ])
    expect(sut.text).toBe('ORD')
    expect(sut.matchCount).toBe(5)
    expect(sut.connectionCount).toBe(2)
    expect(sut.isLoading).toBe(true)
  })

  it('should key each node like the explorer, the same whatever the text', () => {
    const [shop, database, schema, tables, orders] = firstPath(findTables([SHOP], 'order').roots)

    expect(shop).toMatchObject({
      key: '["connection","shop"]',
      scope: { database: '', schema: '' },
      name: '',
      source: SHOP,
      count: 0,
    })
    expect(database).toMatchObject({
      key: '["database","shop","shop"]',
      scope: { database: 'shop', schema: '' },
      name: 'shop',
    })
    expect(schema).toMatchObject({
      key: '["schema","shop","shop","sales"]',
      scope: { database: 'shop', schema: 'sales' },
      name: 'sales',
    })
    expect(tables).toMatchObject({ key: '["tables","shop","shop","sales"]', count: 2, name: '' })
    expect(orders).toStrictEqual({
      key: '["table","shop","shop","sales","orders"]',
      kind: 'table',
      connectionId: 'shop',
      scope: { database: 'shop', schema: 'sales' },
      name: 'orders',
      count: 0,
      highlights: [[0, 5]],
      match: { rank: MatchRank.Substring, start: 0, nameLength: 6, highlights: [[0, 5]] },
      children: [],
    })
    expect(firstPath(findTables([SHOP], 'ord').roots).map(({ key }) => key)).toStrictEqual(
      [shop, database, schema, tables, orders].map((branch) => branch?.key),
    )
  })

  it('should find the characters of the text in order, the best matches of a group first', () => {
    const billing: IndexedConnection = {
      connectionId: 'billing',
      hasSchemas: false,
      isLoading: false,
      scopes: [
        {
          scope: { database: 'billing', schema: 'billing' },
          tables: ['TransactionStatus', 'Tag', 'Transaction', 'trsa_log'],
          views: [],
        },
      ],
    }

    const sut = findTables([billing], 'Trsa')

    expect(outline(sut.roots)).toStrictEqual([
      'connection',
      '  database billing',
      '    tables',
      '      table trsa_log',
      '      table Transaction',
      '      table TransactionStatus',
    ])
    expect(leavesOf(sut.roots).map(({ highlights }) => highlights)).toStrictEqual([
      [[0, 4]],
      [
        [0, 2],
        [4, 6],
      ],
      [
        [0, 2],
        [4, 6],
      ],
    ])
    expect(sut.bestKey).toBe('["table","billing","billing","billing","trsa_log"]')
  })

  it('should open the best match among all the groups, the first of the tree among equals', () => {
    expect(findTables([SHOP, CRM], 'leads').bestKey).toBe('["table","crm","crm","crm","leads"]')
    expect(findTables([SHOP, CRM], 'orders').bestKey).toBe(
      '["table","shop","shop","sales","orders"]',
    )
    expect(findTables([SHOP], 'nothing').bestKey).toBeUndefined()
  })

  it('should put each namespace under its own database', () => {
    expect(outline(findTables([CRM], 'E').roots)).toStrictEqual([
      'connection',
      '  database crm',
      '    tables',
      '      table leads',
      '    views',
      '      view lead_orders',
      '  database billing',
      '    tables',
      '      table invoices',
    ])
  })

  it('should put the groups of a MySQL database right under it', () => {
    const [crm] = findTables([CRM], 'inv').roots

    expect(crm?.children).toMatchObject([
      {
        key: '["database","crm","billing"]',
        scope: { database: 'billing', schema: 'billing' },
        children: [{ key: '["tables","crm","billing","billing"]', kind: 'tables', count: 1 }],
      },
    ])
  })

  it('should find nothing for an empty text, and say what it searched', () => {
    expect(findTables([SHOP], '  ')).toStrictEqual({ ...NOTHING_FOUND, connectionCount: 1 })
    expect(findTables([], 'ord')).toStrictEqual({ ...NOTHING_FOUND, text: 'ord' })
    expect(findTables([SHOP], 'nothing').matchCount).toBe(0)
  })

  it('should filter a few thousand tables, and tell the tree what changed, well within a frame', () => {
    const index = largeIndex()
    const texts = ['c', 'cu', 'cus', 'order_history_1', 'report', 'zzz']

    const time = bestTime(() => {
      let shown = NOTHING_FOUND
      for (const text of texts) {
        const found = findTables(index, text)
        foundChanges(shown, found)
        shown = found
      }
    })

    expect(findTables(index, 'history_2').bestKey).toBe(
      '["table","big","big","schema_2","customer_order_history_2_0"]',
    )
    expect(time / texts.length).toBeLessThan(FRAME_MS)
  })
})
