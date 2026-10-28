import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, mysql, mysqlRequest, nextStream } from '../../../test/fakes/mysql2.ts'
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
import { mysqlEngine } from './mysql-engine.ts'

vi.mock('mysql2', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { createConnection } = await import('../../../test/fakes/mysql2.ts')
  return { default: { ...original.default, createConnection } }
})

const INTERRUPTED = 'Query execution was interrupted'

async function connected(changes: Partial<ConnectRequest> = {}): Promise<EngineSession> {
  return mysqlEngine.connect(mysqlRequest(changes))
}

function sleep(sut: EngineSession): QueryExecution {
  return sut.execute(queryRequest({ sql: 'SELECT SLEEP(10)', maxRows: 1 }))
}

// The connection of the session, then the one that sends KILL QUERY.
function connection(index: number): (typeof mysql.connections)[number] | undefined {
  return mysql.connections.at(index)
}

beforeEach(() => {
  mysql.reset()
  answerBy()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MySQL statements', () => {
  describe('cancel', () => {
    it('should kill the statement from another connection, once, and end when the server stops it', async () => {
      const sut = await connected()
      const execution = sleep(sut)
      const events = await nextStream()

      const cancels = Promise.all([execution.cancel(), execution.cancel()])
      await vi.waitFor(() => {
        expect(connection(1)?.isEnded).toBe(true)
      })
      events.emit('error', new Error(INTERRUPTED))
      events.emit('end')
      await cancels

      const error = await failureOf(execution)
      expect(error).toBeInstanceOf(QueryCancelledError)
      expect(error).toMatchObject({ hasClosedConnection: false })
      expect(mysql.connections).toHaveLength(2)
      expect(connection(1)?.queries).toStrictEqual([{ sql: 'KILL QUERY ?', values: [42] }])
      expect(connection(0)?.isDestroyed).toBe(false)
    })

    it('should report the result of a statement that ended before the kill reached it', async () => {
      const sut = await connected()
      const execution = sut.execute(queryRequest({ sql: 'SELECT 1', maxRows: 1 }))
      const events = await nextStream()

      const cancelled = execution.cancel()
      events.emit('result', ['1'], 0)
      events.emit('end')
      await cancelled

      await expect(execution.result).resolves.toMatchObject({ rows: [['1']] })
      expect(connection(0)?.isDestroyed).toBe(false)
    })

    it('should settle only after the kill is over', async () => {
      const sut = await connected()
      const execution = sut.execute(queryRequest({ sql: 'SELECT SLEEP(10)' }))
      const events = await nextStream()
      const { promise, resolve } = Promise.withResolvers<undefined>()
      mysql.script.answer = () => ({ result: { affectedRows: 0 }, after: promise })
      let hasSettled = false
      void execution.result.catch(() => {
        hasSettled = true
      })

      const cancelled = execution.cancel()
      events.emit('error', new Error(INTERRUPTED))
      events.emit('end')
      await new Promise((settled) => setImmediate(settled))
      expect(hasSettled).toBe(false)

      resolve(undefined)
      await cancelled
      await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
    })

    it('should do nothing once the statement ended', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT 1',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
      ;(await nextStream()).emit('end')
      await execution.result

      await execution.cancel()

      expect(mysql.connections).toHaveLength(1)
    })

    it('should close the connection of a statement the server does not stop in time, and say why', async () => {
      const onUnexpectedClose = vi.fn()
      const sut = await connected({ onUnexpectedClose })
      const execution = sleep(sut)
      await nextStream()
      fakeTheClock()

      const cancelled = execution.cancel()
      await vi.waitFor(() => {
        expect(connection(1)?.isEnded).toBe(true)
      })
      expect(connection(0)?.isDestroyed).toBe(false)
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)
      await cancelled

      const error = await failureOf(execution)
      expect(error).toBeInstanceOf(QueryCancelledError)
      expect(error).toMatchObject({ hasClosedConnection: true })
      expect(connection(0)?.isDestroyed).toBe(true)
      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(new Error(NOT_STOPPED))
    })

    it('should close the connection at once when the kill fails, and say why', async () => {
      const onUnexpectedClose = vi.fn()
      const sut = await connected({ onUnexpectedClose })
      const execution = sleep(sut)
      await nextStream()
      mysql.script.answer = () => ({ error: new Error('Unknown thread id: 42') })

      await execution.cancel()

      await expect(execution.result).rejects.toMatchObject({
        name: 'QueryCancelledError',
        hasClosedConnection: true,
      })
      expect(connection(1)?.isEnded).toBe(true)
      expect(connection(0)?.isDestroyed).toBe(true)
      expect(onUnexpectedClose).toHaveBeenCalledOnce()
      expect(onUnexpectedClose.mock.calls[0]?.[0]).toMatchObject({
        message: notAsked('Unknown thread id: 42'),
      })
    })

    it('should close the connection at once when the kill connection fails, and say why', async () => {
      const onUnexpectedClose = vi.fn()
      const sut = await connected({ onUnexpectedClose })
      const execution = sleep(sut)
      await nextStream()
      mysql.script.answer = (query) => {
        connection(1)?.emit('error', new Error('Connection lost'))
        return { result: { affectedRows: 0, sql: query.sql } }
      }

      await execution.cancel()

      await expect(execution.result).rejects.toMatchObject({ hasClosedConnection: true })
      expect(onUnexpectedClose.mock.calls[0]?.[0]).toMatchObject({
        message: notAsked('Connection lost'),
      })
    })

    it('should give up a kill that hangs, and close both connections', async () => {
      const onUnexpectedClose = vi.fn()
      const sut = await connected({ onUnexpectedClose })
      const execution = sleep(sut)
      await nextStream()
      mysql.script.answer = () => ({ after: NEVER })
      fakeTheClock()

      const cancelled = execution.cancel()
      await vi.waitFor(() => {
        expect(connection(1)?.queries).toHaveLength(1)
      })
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)
      await cancelled

      await expect(execution.result).rejects.toMatchObject({ hasClosedConnection: true })
      expect(connection(1)).toMatchObject({ isDestroyed: true, isEnded: false })
      expect(connection(0)?.isDestroyed).toBe(true)
      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(new Error(REQUEST_LATE))
    })

    it('should give up a kill connection that never connects, and close both connections', async () => {
      const sut = await connected()
      const execution = sleep(sut)
      await nextStream()
      mysql.script.connectAfter = NEVER
      fakeTheClock()

      const cancelled = execution.cancel()
      await vi.waitFor(() => {
        expect(mysql.connections).toHaveLength(2)
      })
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)
      await cancelled

      await expect(execution.result).rejects.toMatchObject({ hasClosedConnection: true })
      expect(connection(1)).toMatchObject({ isDestroyed: true, queries: [] })
      expect(connection(0)?.isDestroyed).toBe(true)
    })

    it('should close the connection when a hung kill could stop a later statement, even after the statement ended', async () => {
      const onUnexpectedClose = vi.fn()
      const sut = await connected({ onUnexpectedClose })
      const execution = sut.execute(queryRequest({ sql: 'SELECT 1', maxRows: 1 }))
      const events = await nextStream()
      mysql.script.answer = () => ({ after: NEVER })
      fakeTheClock()
      let hasSettled = false
      void execution.result.then(() => {
        hasSettled = true
      })

      const cancelled = execution.cancel()
      await vi.waitFor(() => {
        expect(connection(1)?.queries).toHaveLength(1)
      })
      events.emit('result', ['1'], 0)
      events.emit('end')
      await new Promise((settled) => setImmediate(settled))
      expect(hasSettled).toBe(false)
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)
      await cancelled

      await expect(execution.result).resolves.toMatchObject({ rows: [['1']] })
      expect(connection(0)?.isDestroyed).toBe(true)
      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(new Error(REQUEST_LATE))
    })

    it('should cancel once however many times it is asked, and leave no kill connection behind', async () => {
      const onUnexpectedClose = vi.fn()
      const sut = await connected({ onUnexpectedClose })
      const execution = sleep(sut)
      const events = await nextStream()
      fakeTheClock()

      const cancels = [execution.cancel(), execution.cancel()]
      await vi.waitFor(() => {
        expect(connection(1)?.isEnded).toBe(true)
      })
      events.emit('error', new Error(INTERRUPTED))
      events.emit('end')
      await Promise.all([...cancels, execution.cancel()])
      await execution.cancel()
      await vi.advanceTimersByTimeAsync(CANCEL_TIMEOUT_MS)

      await expect(execution.result).rejects.toMatchObject({ hasClosedConnection: false })
      expect(mysql.connections).toHaveLength(2)
      expect(connection(1)).toMatchObject({ isEnded: true, isDestroyed: false })
      expect(connection(0)?.isDestroyed).toBe(false)
      expect(onUnexpectedClose).not.toHaveBeenCalled()
    })
  })
})
