import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, mysql, mysqlRequest, nextStream } from '../../../test/fakes/mysql2.ts'
import { queryRequest } from '../../../test/fakes/query-request.ts'
import type { ConnectRequest, EngineSession } from '../../core/engine/engine.ts'
import { QueryError } from '../../core/engine/query-error.ts'
import type { Row } from '../../core/engine/query.ts'
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
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT id, name FROM orders',
          maxRows: 1000,
          onRows: (rows) => batches.push(rows),
        }),
      )
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
          { name: 'id', dataType: 'LONGLONG', kind: 'number' },
          { name: 'name', dataType: 'VAR_STRING', kind: 'text' },
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
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT x',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
      const events = await nextStream()

      events.emit('fields', [{ name: 'a' }, { name: 'b', columnType: 999 }])
      events.emit('end')

      await expect(execution.result).resolves.toMatchObject({
        columns: [
          { name: 'a', dataType: 'UNKNOWN', kind: 'other' },
          { name: 'b', dataType: 'UNKNOWN', kind: 'other' },
        ],
      })
    })

    it('should send bound values through a prepared statement', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          values: ['%a%', 3, null],
          sql: "SELECT 'why?' FROM t WHERE a LIKE ? AND b = ? AND c <=> ?",
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
      const events = await nextStream()
      events.emit('end')
      await execution.result

      expect(mysql.connections[0]?.queries[1]).toStrictEqual({
        sql: "SELECT 'why?' FROM t WHERE a LIKE ? AND b = ? AND c <=> ?",
        values: ['%a%', 3, null],
        isPrepared: true,
      })
    })

    it('should fail when the consumer of the columns fails', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          onColumns: () => {
            throw new Error('no grid')
          },
          sql: 'SELECT 1',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
      const events = await nextStream()

      events.emit('fields', [{ name: 'a', columnType: LONGLONG }])
      events.emit('end')

      await expect(execution.result).rejects.toThrow('no grid')
    })

    it('should keep at most maxRows rows', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT n',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
      const events = await nextStream()

      events.emit('result', ['1'], 0)
      events.emit('result', ['2'], 0)
      events.emit('end')

      await expect(execution.result).resolves.toMatchObject({ rows: [['1']], isTruncated: true })
    })

    it('should report the rows a statement changed', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'UPDATE orders SET paid = 1',
          maxRows: 10,
          onRows: vi.fn(),
        }),
      )
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
      const execution = sut.execute(
        queryRequest({
          sql: 'SELEC 1',
          maxRows: 10,
          onRows: vi.fn(),
        }),
      )
      const events = await nextStream()

      events.emit('error', new Error('Table shop.missing does not exist'))
      events.emit('end')

      await expect(execution.result).rejects.toThrow(new Error('Table shop.missing does not exist'))
    })

    it('should say where in the statement a syntax error is', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT 1\nFORM t',
          maxRows: 10,
          onRows: vi.fn(),
        }),
      )
      const events = await nextStream()
      const message =
        "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'FORM t' at line 2"

      events.emit('error', new Error(message))
      events.emit('end')

      const error: unknown = await execution.result.catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(QueryError)
      expect(error).toMatchObject({ message, location: { kind: 'line', line: 2, near: 'FORM t' } })
    })

    it('should fail when the consumer of the rows fails, and let the statement finish', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT n',
          maxRows: 10,
          onRows: () => {
            throw new Error('the grid broke')
          },
        }),
      )
      const events = await nextStream()

      for (let row = 0; row < 600; row += 1) {
        events.emit('result', [String(row)], 0)
      }
      events.emit('end')

      await expect(execution.result).rejects.toThrow('the grid broke')
    })

    it('should turn anything thrown by the consumer into an error', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT n',
          maxRows: 1,
          onRows: () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error -- what a careless consumer could throw
            throw 'not an error'
          },
        }),
      )
      const events = await nextStream()

      events.emit('result', ['1'], 0)
      events.emit('end')

      await expect(execution.result).rejects.toThrow(new Error('not an error'))
    })

    it('should refuse a statement result of the wrong shape', async () => {
      const sut = await connected()
      const execution = sut.execute(
        queryRequest({
          sql: 'UPDATE x',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
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
      const execution = sut.execute(
        queryRequest({
          sql: 'SELECT SLEEP(10)',
          maxRows: 1,
          onRows: vi.fn(),
        }),
      )
      const events = await nextStream()
      const lost = new Error('Connection lost: The server closed the connection.')

      mysql.connections[0]?.emit('error', lost)
      events.emit('end')

      await expect(execution.result).rejects.toBe(lost)
      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(lost)
    })

    it('should stop listening to the connection once the statement ended', async () => {
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

      mysql.connections[0]?.emit('error', new Error('later'))

      await expect(execution.result).resolves.toMatchObject({ rows: [] })
    })
  })
})
