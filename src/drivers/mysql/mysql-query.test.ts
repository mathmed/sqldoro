import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, mysql, mysqlRequest, nextStream } from '../../../test/fakes/mysql2.ts'
import type { ConnectRequest, EngineSession } from '../../core/engine/engine.ts'
import { QueryCancelledError, type Row } from '../../core/engine/query.ts'
import { mysqlEngine } from './mysql-engine.ts'

vi.mock('mysql2', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { createConnection } = await import('../../../test/fakes/mysql2.ts')
  return { default: { ...original.default, createConnection } }
})

const LONGLONG = 8
const VAR_STRING = 253

async function connected(changes: Partial<ConnectRequest> = {}): Promise<EngineSession> {
  return mysqlEngine.connect(mysqlRequest(changes))
}

beforeEach(() => {
  mysql.reset()
  answerBy()
})

describe('MySQL statements', () => {
  describe('execute', () => {
    it('should stream the rows of the first result set in batches and describe its columns', async () => {
      const sut = await connected()
      const batches: (readonly Row[])[] = []
      const execution = sut.execute({
        sql: 'SELECT id, name FROM orders',
        maxRows: 1000,
        onRows: (rows) => batches.push(rows),
      })
      const events = await nextStream()

      events.emit('fields', [
        { name: 'id', columnType: LONGLONG },
        { name: 'name', type: VAR_STRING },
      ])
      events.emit('result', ['1', 'one'], 0)
      events.emit('result', ['2', Buffer.from([0xff])], 0)
      events.emit('fields', [{ name: 'other', columnType: LONGLONG }])
      events.emit('result', ['ignored'], 1)
      events.emit('result', { affectedRows: 0 })
      events.emit('end')

      await expect(execution.result).resolves.toStrictEqual({
        columns: [
          { name: 'id', dataType: 'LONGLONG' },
          { name: 'name', dataType: 'VAR_STRING' },
        ],
        rows: [
          ['1', 'one'],
          ['2', '0xff'],
        ],
        isTruncated: false,
        affectedRows: 0,
      })
      expect(batches).toStrictEqual([
        [
          ['1', 'one'],
          ['2', '0xff'],
        ],
      ])
      expect(mysql.connections[0]?.queries[1]).toStrictEqual({
        sql: 'SELECT id, name FROM orders',
        values: [],
      })
    })

    it('should name a column type it does not know as unknown', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT x', maxRows: 1, onRows: vi.fn() })
      const events = await nextStream()

      events.emit('fields', [{ name: 'a' }, { name: 'b', columnType: 999 }])
      events.emit('end')

      await expect(execution.result).resolves.toMatchObject({
        columns: [
          { name: 'a', dataType: 'UNKNOWN' },
          { name: 'b', dataType: 'UNKNOWN' },
        ],
      })
    })

    it('should keep at most maxRows rows', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT n', maxRows: 1, onRows: vi.fn() })
      const events = await nextStream()

      events.emit('result', ['1'], 0)
      events.emit('result', ['2'], 0)
      events.emit('end')

      await expect(execution.result).resolves.toMatchObject({ rows: [['1']], isTruncated: true })
    })

    it('should report the rows a statement changed', async () => {
      const sut = await connected()
      const execution = sut.execute({
        sql: 'UPDATE orders SET paid = 1',
        maxRows: 10,
        onRows: vi.fn(),
      })
      const events = await nextStream()

      events.emit('fields', undefined)
      events.emit('result', { affectedRows: 3, insertId: 0 })
      events.emit('end')

      await expect(execution.result).resolves.toStrictEqual({
        columns: [],
        rows: [],
        isTruncated: false,
        affectedRows: 3,
      })
    })

    it('should show the server message of a failed statement', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELEC 1', maxRows: 10, onRows: vi.fn() })
      const events = await nextStream()

      events.emit('error', new Error('You have an error in your SQL syntax'))
      events.emit('end')

      await expect(execution.result).rejects.toThrow('You have an error in your SQL syntax')
    })

    it('should fail when the consumer of the rows fails, and let the statement finish', async () => {
      const sut = await connected()
      const execution = sut.execute({
        sql: 'SELECT n',
        maxRows: 10,
        onRows: () => {
          throw new Error('the grid broke')
        },
      })
      const events = await nextStream()

      for (let row = 0; row < 600; row += 1) {
        events.emit('result', [String(row)], 0)
      }
      events.emit('end')

      await expect(execution.result).rejects.toThrow('the grid broke')
    })

    it('should turn anything thrown by the consumer into an error', async () => {
      const sut = await connected()
      const execution = sut.execute({
        sql: 'SELECT n',
        maxRows: 1,
        onRows: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- what a careless consumer could throw
          throw 'not an error'
        },
      })
      const events = await nextStream()

      events.emit('result', ['1'], 0)
      events.emit('end')

      await expect(execution.result).rejects.toThrow(new Error('not an error'))
    })

    it('should refuse a statement result of the wrong shape', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'UPDATE x', maxRows: 1, onRows: vi.fn() })
      const events = await nextStream()

      events.emit('result', { message: 'no count' })
      events.emit('end')

      await expect(execution.result).rejects.toThrow(
        new TypeError('"affectedRows" must be a number'),
      )
    })

    it('should fail a streamed statement when the connection drops', async () => {
      const onUnexpectedClose = vi.fn()
      const sut = await connected({ onUnexpectedClose })
      const execution = sut.execute({ sql: 'SELECT SLEEP(10)', maxRows: 1, onRows: vi.fn() })
      const events = await nextStream()
      const lost = new Error('Connection lost: The server closed the connection.')

      mysql.connections[0]?.emit('error', lost)
      events.emit('end')

      await expect(execution.result).rejects.toBe(lost)
      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(lost)
    })

    it('should stop listening to the connection once the statement ended', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT 1', maxRows: 1, onRows: vi.fn() })
      ;(await nextStream()).emit('end')
      await execution.result

      mysql.connections[0]?.emit('error', new Error('later'))

      await expect(execution.result).resolves.toMatchObject({ rows: [] })
    })
  })

  describe('cancel', () => {
    it('should kill the statement from another connection and reject the result as cancelled', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT SLEEP(10)', maxRows: 1, onRows: vi.fn() })
      const events = await nextStream()

      await Promise.all([execution.cancel(), execution.cancel()])
      events.emit('result', ['1'], 0)
      events.emit('end')

      await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
      expect(mysql.connections).toHaveLength(2)
      expect(mysql.connections[1]?.queries).toStrictEqual([{ sql: 'KILL QUERY ?', values: [42] }])
      expect(mysql.connections[1]?.isEnded).toBe(true)
    })

    it('should report the statement as cancelled when the kill interrupts it', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT SLEEP(10)', maxRows: 1, onRows: vi.fn() })
      const events = await nextStream()

      await execution.cancel()
      events.emit('error', new Error('Query execution was interrupted'))
      events.emit('end')

      await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
    })

    it('should do nothing once the statement ended', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT 1', maxRows: 1, onRows: vi.fn() })
      ;(await nextStream()).emit('end')
      await execution.result

      await execution.cancel()

      expect(mysql.connections).toHaveLength(1)
    })

    it('should say why the kill failed', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT SLEEP(10)', maxRows: 1, onRows: vi.fn() })
      await nextStream()
      mysql.script.answer = () => ({ error: new Error('Unknown thread id: 42') })

      await expect(execution.cancel()).rejects.toThrow('Unknown thread id: 42')
      expect(mysql.connections[1]?.isEnded).toBe(true)
    })

    it('should say why the kill connection failed', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT SLEEP(10)', maxRows: 1, onRows: vi.fn() })
      await nextStream()
      mysql.script.answer = (query) => {
        mysql.connections[1]?.emit('error', new Error('Connection lost'))
        return { result: { affectedRows: 0, sql: query.sql } }
      }

      await expect(execution.cancel()).rejects.toThrow('Connection lost')
    })
  })
})
