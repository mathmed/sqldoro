import mysql, { type Connection, type FieldPacket, type QueryError } from 'mysql2'

import {
  QueryCancelledError,
  type QueryExecution,
  type QueryRequest,
  type QueryResult,
  type ResultColumn,
  RowCollector,
  toCellValue,
} from '../../core/engine/query.ts'
import { readNumber, readRecord } from '../../core/json/record.ts'
import { toError } from '../../core/text/errors.ts'

const BATCH_SIZE = 500
const FIRST_RESULT = 0
const UNKNOWN_TYPE = 'UNKNOWN'
// mysql2 maps each protocol type code to its name (3 -> LONG).
const TYPE_NAMES: ReadonlyMap<number, string> = new Map(
  Object.entries(mysql.Types).flatMap(([code, name]) =>
    typeof name === 'string' ? [[Number(code), name] as const] : [],
  ),
)

export interface QueryTarget {
  readonly connection: Connection
  // Stops the statement running on the connection, from another connection.
  readonly kill: () => Promise<void>
  // A streamed statement hears nothing when the connection drops: the session tells it. Returns
  // the function that stops listening.
  readonly onConnectionLost: (listener: (error: Error) => void) => () => void
}

// Rows of the first result set are kept up to maxRows; the statement always runs to completion on
// the server, so a write is never cut halfway by the row limit. mysql2 calls the handlers below
// from its own events, where an exception would escape: the first one fails the query instead.
class Execution {
  readonly #collector: RowCollector
  #columns: readonly ResultColumn[] | undefined
  #affectedRows: number | undefined
  #failure: Error | undefined
  #isCancelled = false
  #isDone = false

  constructor(request: QueryRequest) {
    this.#collector = new RowCollector(request, BATCH_SIZE)
  }

  get isDone(): boolean {
    return this.#isDone
  }

  markCancelled(): void {
    this.#isCancelled = true
  }

  // OK packets have no fields: the first list of fields describes the first result set.
  onFields(fields: FieldPacket[] | undefined): void {
    if (fields !== undefined && this.#columns === undefined) {
      this.#columns = fields.map(toResultColumn)
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

  finish(): QueryResult {
    this.#isDone = true
    if (this.#isCancelled) {
      throw new QueryCancelledError()
    }
    if (this.#failure !== undefined) {
      throw this.#failure
    }
    return this.#collector.finish(this.#columns ?? [], this.#affectedRows)
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
  const { promise, resolve, reject } = Promise.withResolvers<QueryResult>()
  const end = (): void => {
    stopWatching()
    if (!execution.isDone) {
      settle(execution, { resolve, reject })
    }
  }
  const stopWatching = target.onConnectionLost((error) => {
    execution.fail(error)
    end()
  })
  target.connection
    .query({ sql: request.sql, rowsAsArray: true })
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
  return { result: promise, cancel: canceller(target, execution) }
}

interface Settlement {
  readonly resolve: (result: QueryResult) => void
  readonly reject: (reason: unknown) => void
}

function settle(execution: Execution, { resolve, reject }: Settlement): void {
  try {
    resolve(execution.finish())
  } catch (error) {
    reject(toError(error))
  }
}

function canceller(target: QueryTarget, execution: Execution): () => Promise<void> {
  let cancelling: Promise<void> | undefined
  return async () => {
    if (execution.isDone) {
      return
    }
    execution.markCancelled()
    cancelling ??= target.kill()
    await cancelling
  }
}

function toResultColumn(field: FieldPacket): ResultColumn {
  const code = field.columnType ?? field.type
  const name = code === undefined ? undefined : TYPE_NAMES.get(code)
  return { name: field.name, dataType: name ?? UNKNOWN_TYPE }
}
