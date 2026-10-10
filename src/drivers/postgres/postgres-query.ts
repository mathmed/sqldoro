import pg, { type Client, type FieldDef, type QueryResult as PgResult } from 'pg'
import Cursor from 'pg-cursor'

import {
  QueryCancelledError,
  type QueryExecution,
  type QueryRequest,
  type QueryResult,
  type ResultColumn,
  type Row,
  RowCollector,
  toCellValue,
} from '../../core/engine/query.ts'
import { toError } from '../../core/text/errors.ts'
import { TYPES } from './postgres-connection.ts'

const BATCH_SIZE = 500
const PROBE_SIZE = 1
const SELECT_COMMAND = 'SELECT'
const UNKNOWN_TYPE = 'UNKNOWN'
const TYPE_NAMES: ReadonlyMap<number, string> = new Map(
  Object.entries(pg.types.builtins).map(([name, oid]) => [oid, name]),
)

export interface QueryTarget {
  readonly client: Client
  // Cancels the statement running on the client, from another connection.
  readonly cancel: () => Promise<void>
}

interface Page {
  readonly rows: readonly unknown[]
  readonly result: PgResult
}

class CancelState {
  #isRequested = false
  #isDone = false

  get isRequested(): boolean {
    return this.#isRequested
  }

  get canCancel(): boolean {
    return !this.#isDone
  }

  request(): void {
    this.#isRequested = true
  }

  finish(): void {
    this.#isDone = true
  }
}

export function executeQuery(target: QueryTarget, request: QueryRequest): QueryExecution {
  const state = new CancelState()
  const result = run(target.client, request, state)
  // The result may be awaited after cancel(): its rejection reaches the caller then, instead of
  // being reported as unhandled in between.
  void result.catch(() => undefined)
  return { result, cancel: canceller(target, state) }
}

// A cursor reads the rows in batches: past maxRows it reads one more row to learn whether the
// result was cut, then closing the cursor stops the statement on the server.
async function run(
  client: Client,
  request: QueryRequest,
  state: CancelState,
): Promise<QueryResult> {
  const collector = new RowCollector(request, BATCH_SIZE)
  const cursor = client.query(
    new Cursor(request.sql, undefined, { rowMode: 'array', types: TYPES }),
  )
  try {
    const result = await readAll(cursor, collector)
    if (state.isRequested) {
      throw new QueryCancelledError()
    }
    return collector.finish(result.fields.map(toResultColumn), affectedRowsOf(result))
  } catch (error) {
    throw state.isRequested ? new QueryCancelledError() : toError(error)
  } finally {
    state.finish()
  }
}

// A server error ends the cursor by itself; any other failure leaves it open, and pg would queue
// every later statement behind it: it is closed before the error goes on.
async function readAll(cursor: Cursor, collector: RowCollector): Promise<PgResult> {
  let page: Page
  let isFinished: boolean
  do {
    const isProbe = collector.remaining === 0
    const size = isProbe ? PROBE_SIZE : Math.min(BATCH_SIZE, collector.remaining)
    page = await readPage(cursor, size)
    try {
      addRows(page.rows, collector)
    } catch (error) {
      await cursor.close()
      throw error
    }
    isFinished = isProbe || page.rows.length < size
  } while (!isFinished)
  await cursor.close()
  return page.result
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

function toResultColumn(field: FieldDef): ResultColumn {
  return { name: field.name, dataType: TYPE_NAMES.get(field.dataTypeID) ?? UNKNOWN_TYPE }
}

function canceller(target: QueryTarget, state: CancelState): () => Promise<void> {
  let cancelling: Promise<void> | undefined
  return async () => {
    if (!state.canCancel) {
      return
    }
    state.request()
    cancelling ??= target.cancel()
    await cancelling
  }
}
