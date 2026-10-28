import type { Connection, FieldPacket, Query, QueryError } from 'mysql2'

import { Cancellation, type Stopper } from '../../core/engine/cancellation.ts'
import {
  type QueryExecution,
  type QueryRequest,
  type QueryResult,
  RowCollector,
  toCellValue,
} from '../../core/engine/query.ts'
import { readNumber, readRecord } from '../../core/json/record.ts'
import { toError } from '../../core/text/errors.ts'
import { locatedError } from './mysql-errors.ts'
import { toResultColumn } from './mysql-types.ts'

const BATCH_SIZE = 500
const FIRST_RESULT = 0

export interface QueryTarget {
  readonly connection: Connection
  // Stops the statement running on the connection: the server is asked from another connection,
  // and the connection goes when it does not stop the statement in time.
  readonly stopper: Stopper
  // A streamed statement hears nothing when the connection drops: the session tells it. Returns
  // the function that stops listening.
  readonly onConnectionLost: (listener: (error: Error) => void) => () => void
}

// Rows of the first result set are kept up to maxRows; the statement always runs to completion on
// the server, so a write is never cut halfway by the row limit. mysql2 calls the handlers below
// from its own events, where an exception would escape: the first one fails the query instead.
class Execution {
  readonly #collector: RowCollector
  #affectedRows: number | undefined
  #failure: Error | undefined
  #hasEnded = false

  constructor(request: QueryRequest) {
    this.#collector = new RowCollector(request, BATCH_SIZE)
  }

  // The statement ends once: when the server says so, or when the connection drops first.
  claimEnd(): boolean {
    const isFirst = !this.#hasEnded
    this.#hasEnded = true
    return isFirst
  }

  // OK packets have no fields: the first list of fields describes the first result set.
  onFields(fields: FieldPacket[] | undefined): void {
    if (fields !== undefined) {
      this.#guard(() => {
        this.#collector.describe(fields.map(toResultColumn))
      })
    }
  }

  onResult(row: unknown, index: number | undefined): void {
    this.#guard(() => {
      if (!Array.isArray(row)) {
        this.#affectedRows = readNumber(readRecord(row), 'affectedRows')
        return
      }
      if (index === FIRST_RESULT) {
        this.#collector.add(row.map(toCellValue))
      }
    })
  }

  fail(error: unknown): void {
    this.#failure ??= toError(error)
  }

  // A statement that ran to its end before the kill reached it reports its result: it did run.
  finish(cancellation: Cancellation): QueryResult {
    if (this.#failure !== undefined) {
      throw cancellation.isRequested ? cancellation.cancelledError() : locatedError(this.#failure)
    }
    return this.#collector.finish(this.#affectedRows)
  }

  #guard(handle: () => void): void {
    try {
      handle()
    } catch (error) {
      this.fail(error)
    }
  }
}

export function executeQuery(target: QueryTarget, request: QueryRequest): QueryExecution {
  const execution = new Execution(request)
  const cancellation = new Cancellation(wait)
  const { promise, resolve, reject } = Promise.withResolvers<QueryResult>()
  const end = (): void => {
    stopWatching()
    if (execution.claimEnd()) {
      void cancellation.finish().then(() => {
        settle(execution, cancellation, { resolve, reject })
      })
    }
  }
  const stopWatching = target.onConnectionLost((error) => {
    execution.fail(error)
    end()
  })
  sendStatement(target.connection, request)
    .on('fields', (fields: FieldPacket[] | undefined) => {
      execution.onFields(fields)
    })
    .on('result', (row: unknown, index: number | undefined) => {
      execution.onResult(row, index)
    })
    .on('error', (error: QueryError) => {
      execution.fail(error)
    })
    .on('end', end)
  // The result may be awaited after cancel(): its rejection reaches the caller then, instead of
  // being reported as unhandled in between.
  void promise.catch(() => undefined)
  return { result: promise, cancel: async () => cancellation.cancel(target.stopper) }
}

// The timer of a cancel.
async function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

// Bound values go through a prepared statement: the server places them, so a ? inside a string of
// the statement stays text.
function sendStatement(connection: Connection, request: QueryRequest): Query {
  const options = { sql: request.sql, rowsAsArray: true }
  return request.values.length === 0
    ? connection.query(options)
    : connection.execute({ ...options, values: [...request.values] })
}

interface Settlement {
  readonly resolve: (result: QueryResult) => void
  readonly reject: (reason: unknown) => void
}

function settle(
  execution: Execution,
  cancellation: Cancellation,
  { resolve, reject }: Settlement,
): void {
  try {
    resolve(execution.finish(cancellation))
  } catch (error) {
    reject(toError(error))
  }
}
