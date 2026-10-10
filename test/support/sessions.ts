// An engine session that answers statements from a script instead of a database server: it plays
// the columns and rows of each answer, fails it, or keeps it running until it is cancelled.
import { vi } from 'vitest'

import type { EngineSession } from '../../src/core/engine/engine.ts'
import {
  QueryCancelledError,
  type QueryExecution,
  type QueryRequest,
  type QueryResult,
  type ResultColumn,
  type Row,
} from '../../src/core/engine/query.ts'
import type { TableDescription } from '../../src/core/engine/table.ts'
import { TransactionStatus } from '../../src/core/engine/transaction-status.ts'
import { fakeSession } from '../fakes/engine.ts'

export interface Answer {
  readonly columns?: readonly ResultColumn[]
  readonly rows?: readonly Row[]
  readonly affectedRows?: number
  readonly isTruncated?: boolean
  readonly error?: Error
  // Runs until cancel() is called.
  readonly isPending?: boolean
}

export class ScriptedEngine {
  readonly requests: QueryRequest[] = []
  readonly cancel = vi.fn(async () => Promise.resolve())
  readonly useScope = vi.fn(async () => Promise.resolve())
  answer: (request: QueryRequest) => Answer = () => ({})
  // What the server says of the transaction after each statement.
  status: TransactionStatus = TransactionStatus.Idle
  // The tables of the catalog, by the key result columns name them with.
  readonly tables = new Map<string, TableDescription>()
  readonly describeTable = vi.fn(async (...[, table]: [string, readonly string[]]) =>
    Promise.resolve(this.tables.get(JSON.stringify(table))),
  )
  // Why the server would change the values written, as MySQL outside strict mode.
  writeProblem: string | undefined = undefined

  session(overrides: Partial<EngineSession> = {}): EngineSession {
    return fakeSession({
      execute: (request) => this.#execute(request),
      useScope: this.useScope,
      transactionStatus: async () => Promise.resolve(this.status),
      describeTable: this.describeTable,
      writeProblem: async () => Promise.resolve(this.writeProblem),
      ...overrides,
    })
  }

  #execute(request: QueryRequest): QueryExecution {
    this.requests.push(request)
    const answer = this.answer(request)
    const { promise, resolve, reject } = Promise.withResolvers<QueryResult>()
    void promise.catch(() => undefined)
    if (!(answer.isPending ?? false)) {
      queueMicrotask(() => {
        play(request, answer, { resolve, reject })
      })
    }
    return {
      result: promise,
      cancel: async () => {
        await this.cancel()
        reject(new QueryCancelledError())
      },
    }
  }
}

interface Settlement {
  readonly resolve: (result: QueryResult) => void
  readonly reject: (error: Error) => void
}

function play(request: QueryRequest, answer: Answer, { resolve, reject }: Settlement): void {
  const { columns = [], rows = [], error } = answer
  request.onColumns(columns)
  if (rows.length > 0) {
    request.onRows(rows)
  }
  if (error === undefined) {
    resolve({
      columns,
      rows,
      isTruncated: answer.isTruncated === true,
      affectedRows: answer.affectedRows,
    })
    return
  }
  reject(error)
}
