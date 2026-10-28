import { beforeEach, describe, expect, it, vi } from 'vitest'

import { firstCursor, pg, pgRequest, serveRows } from '../../../test/fakes/pg.ts'
import { queryRequest } from '../../../test/fakes/query-request.ts'
import { failureOf } from '../../../test/support/cancel.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { QueryCancelledError } from '../../core/engine/query.ts'
import { postgresEngine } from './postgres-engine.ts'

vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { FakeClient } = await import('../../../test/fakes/pg.ts')
  return { default: { ...original.default, Client: FakeClient } }
})
vi.mock('pg-cursor', async () => {
  const { FakeCursor } = await import('../../../test/fakes/pg.ts')
  return { default: FakeCursor }
})

const CANCELLING = 'canceling statement due to user request'

function hasCancelled(client: (typeof pg.clients)[number]): boolean {
  return client.queries.some((query) => query.sql.includes('pg_cancel_backend'))
}

async function connected(): Promise<EngineSession> {
  return postgresEngine.connect(pgRequest())
}

beforeEach(() => {
  pg.reset()
})

describe('PostgreSQL statements', () => {
  describe('cancel', () => {
    it('should cancel the backend of the session once, from another connection, and end when the server stops the statement', async () => {
      pg.script.read = () => ({ error: new Error(CANCELLING) })
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT pg_sleep(10)',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )

      await Promise.all([execution.cancel(), execution.cancel()])

      const error = await failureOf(execution)
      expect(error).toBeInstanceOf(QueryCancelledError)
      expect(error).toMatchObject({
        message: 'The query was cancelled',
        hasClosedConnection: false,
      })
      expect(pg.clients.filter(hasCancelled)).toHaveLength(1)
      expect(pg.clients[1]?.config).toMatchObject({ database: 'shop' })
      expect(pg.clients[1]?.queries).toStrictEqual([
        { sql: 'SELECT pg_cancel_backend($1)', values: [4242] },
      ])
      expect(pg.clients[1]?.isEnded).toBe(true)
      expect(pg.clients[0]?.isDestroyed).toBe(false)
    })

    it('should report the result of a statement that ended before the cancel reached it', async () => {
      serveRows(1)
      const sut = await connected()
      const execution = sut.execute(queryRequest({ sql: 'SELECT 1', maxRows: 10 }))

      await execution.cancel()

      await expect(execution.result).resolves.toMatchObject({ rows: [[1]] })
    })

    it('should stop reading at the next page when the server ignores the cancel', async () => {
      serveRows(5000)
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT n',
          maxRows: 5000,
          onRows: () => {
            void execution.cancel()
          },
        }),
      )

      await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
      expect(firstCursor().reads).toStrictEqual([500])
      expect(firstCursor().isClosed).toBe(true)
    })

    it('should settle only after the cancel request is over', async () => {
      pg.script.read = () => ({ error: new Error(CANCELLING) })
      const sut = await connected()
      const { promise, resolve } = Promise.withResolvers<undefined>()
      pg.script.answer = (query) =>
        query.sql.includes('pg_cancel_backend') ? { after: promise } : {}
      const execution = sut.execute(queryRequest({ sql: 'SELECT pg_sleep(10)' }))
      let hasSettled = false
      void execution.result.catch(() => {
        hasSettled = true
      })

      const cancelled = execution.cancel()
      await new Promise((settle) => setImmediate(settle))
      expect(hasSettled).toBe(false)

      resolve(undefined)
      await cancelled
      await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
    })

    it('should do nothing once the statement ended', async () => {
      serveRows(1)
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT 1',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
      await execution.result

      await execution.cancel()

      expect(pg.clients).toHaveLength(1)
    })
  })
})
