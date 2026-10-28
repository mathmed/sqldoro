import type { Client, QueryResult as PgResult } from 'pg'
import Cursor from 'pg-cursor'

import { Cancellation, type Stopper } from '../../core/engine/cancellation.ts'
import {
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
  // Stops the statement running on the client: the server is asked from another connection, and
  // the client goes when it does not stop the statement in time.
  readonly stopper: Stopper
}

// How a statement stops: its cancel, and when it closed the client of the statement (what the
// statement waits for then never comes: closing a cursor waits for an answer of the server).
interface Stopping {
  readonly cancellation: Cancellation
  readonly dropped: Promise<undefined>
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
  const cancellation = new Cancellation(wait)
  const dropped = Promise.withResolvers<undefined>()
  const stopper: Stopper = {
    kill: target.stopper.kill,
    drop: (reason) => {
      dropped.resolve(undefined)
      target.stopper.drop(reason)
    },
  }
  const result = run(target.client, request, { cancellation, dropped: dropped.promise })
  // The result may be awaited after cancel(): its rejection reaches the caller then, instead of
  // being reported as unhandled in between.
  void result.catch(() => undefined)
  return { result, cancel: async () => cancellation.cancel(stopper) }
}

// The timer of a cancel.
async function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

// A cursor reads the rows in batches; closing it stops the statement on the server. A statement that
// ran to its end before a cancel reached it reports its result: it did run.
async function run(
  client: Client,
  request: QueryRequest,
  { cancellation, dropped }: Stopping,
): Promise<QueryResult> {
  const collector = new RowCollector(request, BATCH_SIZE)
  const cursor = client.query(
    new Cursor(request.sql, [...request.values], { rowMode: 'array', types: TYPES }),
  )
  try {
    const last = await Promise.race([
      readAll(cursor, collector, cancellation),
      dropped.then((): never => {
        throw cancellation.cancelledError()
      }),
    ])
    return collector.finish(affectedRowsOf(last))
  } catch (error) {
    throw cancellation.isRequested ? cancellation.cancelledError() : locatedError(toError(error))
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
      throw cancellation.cancelledError()
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
