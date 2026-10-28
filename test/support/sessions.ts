// An engine session that answers statements from a script instead of a database server: it plays
// the columns and rows of each answer, fails it, or keeps it running until it is cancelled.
import { vi } from 'vitest'

import type {
  ForeignKeyInfo,
  ObjectRef,
  ReferenceInfo,
  TableInfo,
  ViewInfo,
} from '../../src/core/engine/catalog.ts'
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

export const STRICT_WRITES_ON = 'strict writes on'
export const STRICT_WRITES_OFF = 'strict writes off'

export interface Answer {
  readonly columns?: readonly ResultColumn[]
  readonly rows?: readonly Row[]
  readonly affectedRows?: number
  readonly isTruncated?: boolean
  readonly error?: Error
  // The answer comes once this promise settles, like a slow server.
  readonly after?: Promise<unknown>
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
  // What the session went through, in order: the SQL of each statement, and the strict writes
  // turned on (STRICT_WRITES_ON) and the session put back (STRICT_WRITES_OFF).
  readonly timeline: string[] = []
  // The failures of the server when it turns strict writes on, or puts the session back.
  strictWritesError: Error | undefined = undefined
  restoreError: Error | undefined = undefined
  // The foreign keys of the tables of the catalog, those that point at them, and the tables by where
  // they are: by placeKey.
  readonly foreignKeys = new Map<string, readonly ForeignKeyInfo[]>()
  readonly references = new Map<string, readonly ReferenceInfo[]>()
  readonly places = new Map<string, TableDescription>()
  // The tables and views of every schema.
  readonly listTables = vi.fn(async (): Promise<readonly TableInfo[]> => Promise.resolve([]))
  readonly listViews = vi.fn(async (): Promise<readonly ViewInfo[]> => Promise.resolve([]))

  session(overrides: Partial<EngineSession> = {}): EngineSession {
    return fakeSession({
      execute: (request) => this.#execute(request),
      useScope: this.useScope,
      transactionStatus: async () => Promise.resolve(this.status),
      describeTable: this.describeTable,
      startStrictWrites: async () => this.#startStrictWrites(),
      listForeignKeys: async (table) =>
        Promise.resolve(this.foreignKeys.get(placeKey(table)) ?? []),
      listReferences: async (table) => Promise.resolve(this.references.get(placeKey(table)) ?? []),
      describeTableAt: async (table) => Promise.resolve(this.places.get(placeKey(table))),
      listTables: this.listTables,
      listViews: this.listViews,
      ...overrides,
    })
  }

  async #startStrictWrites(): Promise<() => Promise<void>> {
    if (this.strictWritesError !== undefined) {
      return Promise.reject(this.strictWritesError)
    }
    this.timeline.push(STRICT_WRITES_ON)
    return Promise.resolve(async () => {
      if (this.restoreError !== undefined) {
        return Promise.reject(this.restoreError)
      }
      this.timeline.push(STRICT_WRITES_OFF)
      return Promise.resolve()
    })
  }

  #execute(request: QueryRequest): QueryExecution {
    this.requests.push(request)
    this.timeline.push(request.sql)
    const answer = this.answer(request)
    const { promise, resolve, reject } = Promise.withResolvers<QueryResult>()
    void promise.catch(() => undefined)
    if (!(answer.isPending ?? false)) {
      void (answer.after ?? Promise.resolve()).then(() => {
        play(request, answer, { resolve, reject })
      })
    }
    return {
      result: promise,
      cancel: async () => {
        await this.cancel()
        reject(new QueryCancelledError({ hasClosedConnection: false }))
      },
    }
  }
}

// A table by where it is, as the catalog maps of the engine hold it.
export function placeKey({ database, schema, name }: ObjectRef): string {
  return JSON.stringify([database, schema, name])
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
