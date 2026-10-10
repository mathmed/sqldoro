import { describe, expect, it } from 'vitest'

import { decodeList, encodeList } from '../json/versioned-list.ts'
import {
  addHistoryEntry,
  HISTORY_FORMAT,
  type HistoryEntry,
  historyOf,
  MAX_HISTORY_SQL_LENGTH,
  removeEntry,
  retainConnections,
  RunOutcome,
  searchHistory,
} from './history.ts'

function entry(id: string, changes: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    connectionId: 'shop',
    sql: `SELECT ${id}`,
    database: 'shop',
    schema: 'public',
    startedAt: '2026-10-10T03:00:00.000Z',
    durationMs: 12,
    outcome: RunOutcome.Succeeded,
    rowCount: 1,
    message: '',
    ...changes,
  }
}

function ids(entries: readonly HistoryEntry[]): string[] {
  return entries.map((kept) => kept.id)
}

describe('addHistoryEntry', () => {
  it('should put the newest entry first', () => {
    expect(ids(addHistoryEntry([entry('a'), entry('b')], entry('c'), 10))).toStrictEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('should move a statement that runs again to the top instead of repeating it', () => {
    const entries = [
      entry('a'),
      entry('b', { sql: 'SELECT x' }),
      entry('c', { sql: 'SELECT x', connectionId: 'crm' }),
    ]

    expect(ids(addHistoryEntry(entries, entry('d', { sql: 'SELECT x' }), 10))).toStrictEqual([
      'd',
      'a',
      'c',
    ])
  })

  it('should keep at most the limit per connection, dropping the oldest', () => {
    const entries = [entry('a'), entry('x', { connectionId: 'crm' }), entry('b'), entry('c')]

    expect(ids(addHistoryEntry(entries, entry('d'), 3))).toStrictEqual(['d', 'a', 'x', 'b'])
    expect(ids(addHistoryEntry(entries, entry('d'), 1))).toStrictEqual(['d', 'x'])
    expect(ids(addHistoryEntry(entries, entry('d'), 0))).toStrictEqual(['d', 'x'])
  })

  it('should not keep empty or very long statements', () => {
    const entries = [entry('a')]

    expect(addHistoryEntry(entries, entry('b', { sql: '  ' }), 10)).toBe(entries)
    expect(
      addHistoryEntry(entries, entry('c', { sql: 'x'.repeat(MAX_HISTORY_SQL_LENGTH + 1) }), 10),
    ).toBe(entries)
    expect(
      ids(addHistoryEntry(entries, entry('d', { sql: 'x'.repeat(MAX_HISTORY_SQL_LENGTH) }), 10)),
    ).toStrictEqual(['d', 'a'])
  })
})

describe('searchHistory', () => {
  const entries = [
    entry('a', { sql: 'SELECT * FROM Orders WHERE id = 1' }),
    entry('b', {
      sql: 'DELETE FROM orders',
      outcome: RunOutcome.Failed,
      message: 'permission denied',
    }),
    entry('c', { sql: 'SELECT 1' }),
  ]

  it('should find the entries holding every word, without case, in the statement or the message', () => {
    expect(ids(searchHistory(entries, 'orders'))).toStrictEqual(['a', 'b'])
    expect(ids(searchHistory(entries, ' ORDERS   where '))).toStrictEqual(['a'])
    expect(ids(searchHistory(entries, 'denied'))).toStrictEqual(['b'])
  })

  it('should find everything for an empty query', () => {
    expect(ids(searchHistory(entries, '  '))).toStrictEqual(['a', 'b', 'c'])
  })
})

describe('historyOf, retainConnections and removeEntry', () => {
  const entries = [
    entry('a'),
    entry('b', { connectionId: 'crm' }),
    entry('c', { connectionId: 'gone' }),
  ]

  it('should keep the entries of one connection', () => {
    expect(ids(historyOf(entries, 'crm'))).toStrictEqual(['b'])
  })

  it('should drop the entries of connections that no longer exist', () => {
    expect(ids(retainConnections(entries, new Set(['shop', 'crm'])))).toStrictEqual(['a', 'b'])
  })

  it('should remove one entry', () => {
    expect(ids(removeEntry(entries, 'b'))).toStrictEqual(['a', 'c'])
  })
})

describe('HISTORY_FORMAT', () => {
  it('should read back what it wrote', () => {
    const entries = [
      entry('a'),
      entry('b', { rowCount: null, outcome: RunOutcome.Cancelled, message: 'x' }),
    ]
    const stored: unknown = JSON.parse(JSON.stringify(encodeList(entries, [], HISTORY_FORMAT)))

    expect(stored).toMatchObject({ version: 1 })
    expect(decodeList(stored, HISTORY_FORMAT)).toStrictEqual({
      items: entries,
      unreadable: [],
      problems: [],
      isWritable: true,
    })
  })

  it('should name the entries it cannot read', () => {
    const decoded = decodeList(
      { version: 1, entries: [{ ...entry('a'), outcome: 'maybe' }] },
      HISTORY_FORMAT,
    )

    expect(decoded.problems).toStrictEqual([
      'History entry #1 cannot be read: "outcome" must be a known value',
    ])
  })

  it('should refuse a format it does not know', () => {
    expect(decodeList({ version: 9, entries: [] }, HISTORY_FORMAT).problems).toStrictEqual([
      'The query history cannot be read: their format (version 9) is not supported',
    ])
  })
})
