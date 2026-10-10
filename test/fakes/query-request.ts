// A query request with nothing to do for the columns and rows, for tests that only look at part of
// it.
import type { QueryRequest } from '../../src/core/engine/query.ts'

export function queryRequest(changes: Partial<QueryRequest> = {}): QueryRequest {
  return {
    sql: 'SELECT 1',
    values: [],
    maxRows: 100,
    onColumns: () => undefined,
    onRows: () => undefined,
    ...changes,
  }
}
