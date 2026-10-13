// Test double of a database driver: an Engine whose sessions answer from memory. It stands in for the
// database server, the external boundary of the core and the extension host.
import type { Dialect } from '../../src/core/engine/dialect.ts'
import type { ConnectRequest, Engine, EngineSession } from '../../src/core/engine/engine.ts'
import type { QueryResult } from '../../src/core/engine/query.ts'
import { TransactionStatus } from '../../src/core/engine/transaction-status.ts'
import { POSTGRES_DIALECT } from '../fixtures/dialects.ts'

export interface FakeEngineOptions {
  readonly id?: string
  readonly displayName?: string
  readonly defaultPort?: number
  readonly urlSchemes?: readonly string[]
  readonly dialect?: Dialect
  readonly connect?: (request: ConnectRequest) => Promise<EngineSession>
}

export interface FakeEngine extends Engine {
  readonly requests: readonly ConnectRequest[]
}

const EMPTY_RESULT: QueryResult = {
  columns: [],
  rows: [],
  isTruncated: false,
  affectedRows: undefined,
}

export function fakeSession(overrides: Partial<EngineSession> = {}): EngineSession {
  return {
    serverVersion: '1.0.0',
    ping: async () => Promise.resolve(),
    close: async () => Promise.resolve(),
    listDatabases: async () => Promise.resolve([]),
    listSchemas: async () => Promise.resolve([]),
    listTables: async () => Promise.resolve([]),
    listViews: async () => Promise.resolve([]),
    listColumns: async () => Promise.resolve([]),
    listIndexes: async () => Promise.resolve([]),
    listForeignKeys: async () => Promise.resolve([]),
    listReferences: async () => Promise.resolve([]),
    objectDdl: async () => Promise.resolve(''),
    useScope: async () => Promise.resolve(),
    execute: () => ({
      result: Promise.resolve(EMPTY_RESULT),
      cancel: async () => Promise.resolve(),
    }),
    transactionStatus: async () => Promise.resolve(TransactionStatus.Idle),
    describeTable: async () => Promise.resolve(undefined),
    describeTableAt: async () => Promise.resolve(undefined),
    startStrictWrites: async () => Promise.resolve(async () => Promise.resolve()),
    ...overrides,
  }
}

const DEFAULT_OPTIONS = {
  id: 'fake',
  displayName: 'FakeSQL',
  defaultPort: 1234,
  urlSchemes: ['fake'],
  dialect: POSTGRES_DIALECT,
  connect: async (): Promise<EngineSession> => Promise.resolve(fakeSession()),
} as const satisfies Required<FakeEngineOptions>

export function fakeEngine(options: FakeEngineOptions = {}): FakeEngine {
  const { connect, ...descriptor } = { ...DEFAULT_OPTIONS, ...options }
  const requests: ConnectRequest[] = []
  return {
    ...descriptor,
    requests,
    connect: async (request) => {
      requests.push(request)
      return connect(request)
    },
  }
}
