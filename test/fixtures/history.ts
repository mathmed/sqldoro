// History entries for the tests of the history store, view and commands.
import { type HistoryEntry, RunOutcome } from '../../src/core/history/history.ts'

export function historyEntry(id: string, changes: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    connectionId: 'shop',
    sql: `SELECT ${id}`,
    database: 'shop',
    schema: 'sales',
    startedAt: '2026-10-10T03:04:05.000Z',
    durationMs: 12,
    outcome: RunOutcome.Succeeded,
    rowCount: 1,
    message: '',
    ...changes,
  }
}
