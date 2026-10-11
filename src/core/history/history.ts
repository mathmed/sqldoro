import {
  readCount,
  readNullable,
  readNumber,
  readOneOf,
  readRecord,
  readString,
} from '../json/record.ts'
import type { ListFormat } from '../json/versioned-list.ts'

export const RunOutcome = {
  Succeeded: 'succeeded',
  Failed: 'failed',
  Cancelled: 'cancelled',
} as const

export type RunOutcome = (typeof RunOutcome)[keyof typeof RunOutcome]

const RUN_OUTCOMES: ReadonlySet<string> = new Set(Object.values(RunOutcome))

// A statement that ran, kept with where and how it ran. Its strings are masked when it set a
// password (redactSqlSecrets) before it gets here.
export interface HistoryEntry {
  readonly id: string
  readonly connectionId: string
  readonly sql: string
  readonly database: string
  readonly schema: string
  // ISO 8601, in UTC.
  readonly startedAt: string
  readonly durationMs: number
  readonly outcome: RunOutcome
  // Rows returned or changed; null when unknown (a failure, a cancel).
  readonly rowCount: number | null
  // The server's message for a failure, empty otherwise.
  readonly message: string
}

// Longer statements (a whole dump) are not kept: the history stays small and quick to search.
export const MAX_HISTORY_SQL_LENGTH = 20_000

const WORD = /\S+/g

function isRunOutcome(value: unknown): value is RunOutcome {
  return typeof value === 'string' && RUN_OUTCOMES.has(value)
}

export const HISTORY_FORMAT: ListFormat<HistoryEntry> = {
  version: 1,
  key: 'entries',
  listName: 'query history',
  entryName: 'History entry',
  decode: (value) => {
    const record = readRecord(value)
    return {
      id: readString(record, 'id'),
      connectionId: readString(record, 'connectionId'),
      sql: readString(record, 'sql'),
      database: readString(record, 'database'),
      schema: readString(record, 'schema'),
      startedAt: readString(record, 'startedAt'),
      durationMs: readNumber(record, 'durationMs'),
      outcome: readOneOf(record, 'outcome', isRunOutcome),
      rowCount: readNullable(record, 'rowCount', readCount),
      message: readString(record, 'message'),
    }
  },
  migrations: new Map(),
}

// Newest first, at most `maxPerConnection` entries per connection. Running the same statement again
// moves it to the top instead of repeating it.
export function addHistoryEntry(
  entries: readonly HistoryEntry[],
  entry: HistoryEntry,
  maxPerConnection: number,
): readonly HistoryEntry[] {
  if (entry.sql.length > MAX_HISTORY_SQL_LENGTH || entry.sql.trim() === '') {
    return entries
  }
  const others = entries.filter(
    (kept) => kept.connectionId !== entry.connectionId || kept.sql !== entry.sql,
  )
  const sameConnection = new Set(
    historyOf(others, entry.connectionId).slice(0, Math.max(maxPerConnection - 1, 0)),
  )
  return [
    entry,
    ...others.filter(
      (kept) => kept.connectionId !== entry.connectionId || sameConnection.has(kept),
    ),
  ]
}

// Entries whose statement or message holds every word of the query, without case.
export function searchHistory(entries: readonly HistoryEntry[], query: string): HistoryEntry[] {
  const words = query.toLowerCase().match(WORD) ?? []
  return entries.filter((entry) => {
    const text = `${entry.sql}\n${entry.message}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}

export function historyOf(entries: readonly HistoryEntry[], connectionId: string): HistoryEntry[] {
  return entries.filter((entry) => entry.connectionId === connectionId)
}

// The history of a deleted connection goes with it.
export function retainConnections(
  entries: readonly HistoryEntry[],
  connectionIds: ReadonlySet<string>,
): readonly HistoryEntry[] {
  return entries.filter((entry) => connectionIds.has(entry.connectionId))
}

export function removeEntry(entries: readonly HistoryEntry[], id: string): readonly HistoryEntry[] {
  return entries.filter((entry) => entry.id !== id)
}
