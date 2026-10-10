// Saved queries for the tests of their store, view and commands.
import type { SavedQuery } from '../../src/core/snippets/saved-queries.ts'

export function savedQuery(id: string, changes: Partial<SavedQuery> = {}): SavedQuery {
  return {
    id,
    name: `Query ${id}`,
    folder: '',
    sql: `SELECT ${id}`,
    createdAt: '2026-10-10T03:00:00.000Z',
    updatedAt: '2026-10-10T03:00:00.000Z',
    ...changes,
  }
}
