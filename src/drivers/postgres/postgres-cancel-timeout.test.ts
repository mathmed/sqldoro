import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { answerBy, firstCursor, pg, pgRequest, serveRows } from '../../../test/fakes/pg.ts'
import { queryRequest } from '../../../test/fakes/query-request.ts'
import {
  failureOf,
  fakeTheClock,
  NEVER,
  NOT_STOPPED,
  notAsked,
  REQUEST_LATE,
} from '../../../test/support/cancel.ts'
import { CANCEL_TIMEOUT_MS } from '../../core/engine/cancellation.ts'
import type { ConnectRequest, EngineSession } from '../../core/engine/engine.ts'
import { QueryCancelledError, type QueryExecution } from '../../core/engine/query.ts'
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

async function connected(changes: Partial<ConnectRequest> = {}): Promise<EngineSession> {
  return postgresEngine.connect(pgRequest(changes))
}

// A statement whose rows never come, on a session that says when it ends.
async function hanging(onUnexpectedClose: Mock): Promise<QueryExecution> {
  pg.script.read = () => ({ after: NEVER })
  const sut = await connected({ onUnexpectedClose })
  return sut.execute(queryRequest({ sql: 'SELECT pg_sleep(10)' }))
}

// The client of the session, then the one that sends the cancel.
function clientAt(index: number): (typeof pg.clients)[number] | undefined {
  return pg.clients.at(index)
}

beforeEach(() => {
  pg.reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PostgreSQL statements', () => {
  describe('cancel, when the server does not stop the statement in time', () => {
    it('should close the client of the statement, and say why', async () => {
      const onUnexpectedClose = vi.fn()
      const execution = await hanging(onUnexpectedClose)
      fakeTheClock()

      const cancelled = execution.cancel()
      await vi.waitFor(() => {
        expect(clientAt(1)?.isEnded).toBe(true)
      })
      expect(clientAt(0)?.isDestroyed).toBe(false)
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)
      await cancelled

      const error = await failureOf(execution)
      expect(error).toBeInstanceOf(QueryCancelledError)
      expect(error).toMatchObject({
        message: 'The query was cancelled: sqldoro closed its connection',
        hasClosedConnection: true,
      })
      expect(clientAt(0)?.isDestroyed).toBe(true)
      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(new Error(NOT_STOPPED))
    })

    it('should stop waiting for a cursor that never closes once its client is closed', async () => {
      serveRows(5000)
      pg.script.closeAfter = NEVER
      const sut = await connected()
      fakeTheClock()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT n',
          maxRows: 5000,
          onRows: () => {
            void execution.cancel()
          },
        }),
      )

      await vi.waitFor(() => {
        expect(firstCursor().isClosed).toBe(true)
        expect(clientAt(1)?.isEnded).toBe(true)
      })
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)

      await expect(execution.result).rejects.toMatchObject({ hasClosedConnection: true })
      expect(firstCursor().reads).toStrictEqual([500])
      expect(clientAt(0)?.isDestroyed).toBe(true)
    })

    it('should close the client at once when the cancel fails, after closing its connection, and say why', async () => {
      const onUnexpectedClose = vi.fn()
      const execution = await hanging(onUnexpectedClose)
      answerBy([['SELECT pg_cancel_backend', { error: new Error('must be a superuser') }]])

      await execution.cancel()

      await expect(execution.result).rejects.toMatchObject({ hasClosedConnection: true })
      expect(clientAt(1)?.isEnded).toBe(true)
      expect(clientAt(0)?.isDestroyed).toBe(true)
      expect(onUnexpectedClose).toHaveBeenCalledOnce()
      expect(onUnexpectedClose.mock.calls[0]?.[0]).toMatchObject({
        message: notAsked('must be a superuser'),
      })
    })

    it('should close the client at once when the cancel connection fails, and say why', async () => {
      const onUnexpectedClose = vi.fn()
      const execution = await hanging(onUnexpectedClose)
      pg.script.answer = (query, client) => {
        client.emit('error', new Error('Connection terminated unexpectedly'))
        return { rows: query.values.length > 0 ? [{ pg_cancel_backend: true }] : [] }
      }

      await execution.cancel()

      expect(clientAt(0)?.isDestroyed).toBe(true)
      expect(onUnexpectedClose.mock.calls[0]?.[0]).toMatchObject({
        message: notAsked('Connection terminated unexpectedly'),
      })
    })

    it('should give up a cancel request that hangs, and close both clients', async () => {
      const onUnexpectedClose = vi.fn()
      const execution = await hanging(onUnexpectedClose)
      answerBy([['SELECT pg_cancel_backend', { after: NEVER }]])
      fakeTheClock()

      const cancelled = execution.cancel()
      await vi.waitFor(() => {
        expect(clientAt(1)?.queries).toHaveLength(1)
      })
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)
      await cancelled

      await expect(execution.result).rejects.toMatchObject({ hasClosedConnection: true })
      expect(clientAt(1)).toMatchObject({ isDestroyed: true, isEnded: false })
      expect(clientAt(0)?.isDestroyed).toBe(true)
      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(new Error(REQUEST_LATE))
    })

    it('should give up a cancel connection that never connects, and close both clients', async () => {
      const execution = await hanging(vi.fn())
      pg.script.connectAfter = NEVER
      fakeTheClock()

      const cancelled = execution.cancel()
      await vi.waitFor(() => {
        expect(pg.clients).toHaveLength(2)
      })
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)
      await cancelled

      await expect(execution.result).rejects.toMatchObject({ hasClosedConnection: true })
      expect(clientAt(1)).toMatchObject({ isDestroyed: true, queries: [] })
      expect(clientAt(0)?.isDestroyed).toBe(true)
    })

    it('should close the client when a hung cancel could stop a later statement, even after the statement ended', async () => {
      const onUnexpectedClose = vi.fn()
      const page = Promise.withResolvers<undefined>()
      serveRows(1, { after: page.promise })
      const sut = await connected({ onUnexpectedClose })
      const execution = sut.execute(queryRequest({ sql: 'SELECT n', maxRows: 10 }))
      answerBy([['SELECT pg_cancel_backend', { after: NEVER }]])
      fakeTheClock()
      let hasSettled = false
      void execution.result.then(() => {
        hasSettled = true
      })

      const cancelled = execution.cancel()
      await vi.waitFor(() => {
        expect(clientAt(1)?.queries).toHaveLength(1)
      })
      page.resolve(undefined)
      await vi.waitFor(() => {
        expect(firstCursor().isClosed).toBe(true)
      })
      expect(hasSettled).toBe(false)
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)
      await cancelled

      await expect(execution.result).resolves.toMatchObject({ rows: [[1]] })
      expect(clientAt(0)?.isDestroyed).toBe(true)
      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(new Error(REQUEST_LATE))
    })

    it('should cancel once however many times it is asked, and leave no cancel connection behind', async () => {
      const onUnexpectedClose = vi.fn()
      const page = Promise.withResolvers<undefined>()
      pg.script.read = () => ({ error: new Error(CANCELLING), after: page.promise })
      const sut = await connected({ onUnexpectedClose })
      const execution = sut.execute(queryRequest({ sql: 'SELECT pg_sleep(10)' }))
      fakeTheClock()

      const cancels = [execution.cancel(), execution.cancel()]
      await vi.waitFor(() => {
        expect(clientAt(1)?.isEnded).toBe(true)
      })
      page.resolve(undefined)
      await Promise.all([...cancels, execution.cancel()])
      await execution.cancel()
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)

      await expect(execution.result).rejects.toMatchObject({ hasClosedConnection: false })
      expect(pg.clients).toHaveLength(2)
      expect(clientAt(1)).toMatchObject({ isEnded: true, isDestroyed: false })
      expect(clientAt(0)?.isDestroyed).toBe(false)
      expect(onUnexpectedClose).not.toHaveBeenCalled()
    })
  })
})
