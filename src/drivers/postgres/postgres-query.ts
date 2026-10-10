import type { Client, QueryResult as PgResult } from 'pg'
import Cursor from 'pg-cursor'

import { Cancellation } from '../../core/engine/cancellation.ts'
import {
  QueryCancelledError,
  type QueryExecution,
  type QueryRequest,
  type QueryResult,
  type Row,
  RowCollector,
  toCellValue,
} from '../../core/engine/query.ts'
import { toError } from '../../core/text/errors.ts'
import { TYPES } from './postgres-connection.ts'
import { locatedError } from './postgres-errors.ts'
import { toResultColumn } from './postgres-types.ts'

const BATCH_SIZE = 500
const PROBE_SIZE = 1
const SELECT_COMMAND = 'SELECT'

export interface QueryTarget {
  readonly client: Client
  // Cancels the statement running on the client, from another connection.
  readonly cancel: () => Promise<void>
}

interface Page {
  readonly rows: readonly unknown[]
  readonly result: PgResult
}

interface PageSize {
  readonly size: number
  // Past maxRows, one more row tells whether the result was cut.
  readonly isProbe: boolean
}

export function executeQuery(target: QueryTarget, request: QueryRequest): QueryExecution {
  const cancellation = new Cancellation()
  const result = run(target.client, request, cancellation)
  // The result may be awaited after cancel(): its rejection reaches the caller then, instead of
  // being reported as unhandled in between.
  void result.catch(() => undefined)
  return { result, cancel: async () => cancellation.cancel(target.cancel) }
}

// A cursor reads the rows in batches; closing it stops the statement on the server. A statement that
// ran to its end before a cancel reached it reports its result: it did run.
async function run(
  client: Client,
  request: QueryRequest,
  cancellation: Cancellation,
): Promise<QueryResult> {
  const collector = new RowCollector(request, BATCH_SIZE)
  const cursor = client.query(
    new Cursor(request.sql, [...request.values], { rowMode: 'array', types: TYPES }),
  )
  try {
    return collector.finish(affectedRowsOf(await readAll(cursor, collector, cancellation)))
  } catch (error) {
    throw cancellation.isRequested ? new QueryCancelledError() : locatedError(toError(error))
  } finally {
    await cancellation.finish()
  }
}

// PostgreSQL ignores a cancel that arrives between two pages, while the cursor waits: the cursor
// also stops at the next page.
async function readAll(
  cursor: Cursor,
  collector: RowCollector,
  cancellation: Cancellation,
): Promise<PgResult> {
  for (;;) {
    if (cancellation.isRequested) {
      await cursor.close()
      throw new QueryCancelledError()
    }
    const { size, isProbe } = pageSize(collector)
    const page = await readInto(cursor, collector, size)
    if (isProbe || page.rows.length < size) {
      await cursor.close()
      return page.result
    }
  }
}

function pageSize(collector: RowCollector): PageSize {
  const isProbe = collector.remaining === 0
  return { size: isProbe ? PROBE_SIZE : Math.min(BATCH_SIZE, collector.remaining), isProbe }
}

// A server error ends the cursor by itself; any other failure leaves it open, and pg would queue
// every later statement behind it: it is closed before the error goes on.
async function readInto(cursor: Cursor, collector: RowCollector, size: number): Promise<Page> {
  const page = await readPage(cursor, size)
  try {
    collector.describe(page.result.fields.map(toResultColumn))
    addRows(page.rows, collector)
  } catch (error) {
    await cursor.close()
    throw error
  }
  return page
}

function addRows(rows: readonly unknown[], collector: RowCollector): void {
  for (const row of rows) {
    collector.add(rowOf(row))
  }
}

async function readPage(cursor: Cursor, size: number): Promise<Page> {
  const { promise, resolve, reject } = Promise.withResolvers<Page>()
  cursor.read(size, (error, rows, result) => {
    if (error instanceof Error) {
      reject(error)
      return
    }
    resolve({ rows, result })
  })
  return promise
}

function rowOf(row: unknown): Row {
  if (!Array.isArray(row)) {
    throw new TypeError('The server sent a row that is not a list of values')
  }
  return row.map(toCellValue)
}

function affectedRowsOf(result: PgResult): number | undefined {
  return result.command === SELECT_COMMAND ? undefined : (result.rowCount ?? undefined)
}
