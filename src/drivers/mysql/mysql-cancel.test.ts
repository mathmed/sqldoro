import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, mysql, mysqlRequest, nextStream } from '../../../test/fakes/mysql2.ts'
import { queryRequest } from '../../../test/fakes/query-request.ts'
import type { ConnectRequest, EngineSession } from '../../core/engine/engine.ts'
import { QueryCancelledError } from '../../core/engine/query.ts'
import { mysqlEngine } from './mysql-engine.ts'

vi.mock('mysql2', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { createConnection } = await import('../../../test/fakes/mysql2.ts')
  return { default: { ...original.default, createConnection } }
})

async function connected(changes: Partial<ConnectRequest> = {}): Promise<EngineSession> {
  return mysqlEngine.connect(mysqlRequest(changes))
}

beforeEach(() => {
  mysql.reset()
  answerBy()
})

describe('MySQL statements', () => {
  describe('cancel', () => {
    it('should kill the statement from another connection, once', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT SLEEP(10)',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
      const events = await nextStream()

      await Promise.all([execution.cancel(), execution.cancel()])
      events.emit('error', new Error('Query execution was interrupted'))
      events.emit('end')

      await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
      expect(mysql.connections).toHaveLength(2)
      expect(mysql.connections[1]?.queries).toStrictEqual([{ sql: 'KILL QUERY ?', values: [42] }])
      expect(mysql.connections[1]?.isEnded).toBe(true)
    })

    it('should report the result of a statement that ended before the kill reached it', async () => {
      const sut = await connected()
      const execution = sut.execute(queryRequest({ sql: 'SELECT 1', maxRows: 1 }))
      const events = await nextStream()

      await execution.cancel()
      events.emit('result', ['1'], 0)
      events.emit('end')

      await expect(execution.result).resolves.toMatchObject({ rows: [['1']] })
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
      events.emit('error', new Error('Query execution was interrupted'))
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

    it('should say why the kill failed', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT SLEEP(10)',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
      await nextStream()
      mysql.script.answer = () => ({ error: new Error('Unknown thread id: 42') })

      await expect(execution.cancel()).rejects.toThrow('Unknown thread id: 42')
      expect(mysql.connections[1]?.isEnded).toBe(true)
    })

    it('should say why the kill connection failed', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT SLEEP(10)',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
      await nextStream()
      mysql.script.answer = (query) => {
        mysql.connections[1]?.emit('error', new Error('Connection lost'))
        return { result: { affectedRows: 0, sql: query.sql } }
      }

      await expect(execution.cancel()).rejects.toThrow('Connection lost')
    })
  })
})
