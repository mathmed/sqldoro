import pgLibrary from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type FakeCursor, type Page, pg, pgRequest } from '../../../test/fakes/pg.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { QueryCancelledError, type Row } from '../../core/engine/query.ts'
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

const { builtins } = pgLibrary.types
const NUMBERS = [{ name: 'n', dataTypeID: builtins.INT4 }]

// Serves `total` numbered rows to whatever reads the cursor.
function serveRows(total: number, page: Partial<Page> = {}): void {
  let served = 0
  pg.script.read = (...[, size]) => {
    const count = Math.min(size, total - served)
    const rows = Array.from({ length: count }, (...[, index]) => [served + index + 1])
    served += rows.length
    return { fields: NUMBERS, rows, ...page }
  }
}

function hasCancelled(client: (typeof pg.clients)[number]): boolean {
  return client.queries.some((query) => query.sql.includes('pg_cancel_backend'))
}

function cursor(): FakeCursor {
  const found = pg.clients[0]?.cursors[0]
  if (found === undefined) {
    throw new Error('no cursor was opened')
  }
  return found
}

async function connected(): Promise<EngineSession> {
  return postgresEngine.connect(pgRequest())
}

beforeEach(() => {
  pg.reset()
})

describe('PostgreSQL statements', () => {
  it('should read the rows through a cursor in batches and describe the columns', async () => {
    serveRows(2, { fields: [...NUMBERS, { name: 'x', dataTypeID: 999_999 }] })
    const sut = await connected()
    const batches: (readonly Row[])[] = []

    const result = await sut.execute({
      sql: 'SELECT n',
      maxRows: 10,
      onRows: (rows) => batches.push(rows),
    }).result

    expect(result).toStrictEqual({
      columns: [
        { name: 'n', dataType: 'INT4' },
        { name: 'x', dataType: 'UNKNOWN' },
      ],
      rows: [[1], [2]],
      isTruncated: false,
      affectedRows: undefined,
    })
    expect(batches).toStrictEqual([[[1], [2]]])
    expect(cursor()).toMatchObject({ sql: 'SELECT n', isClosed: true, reads: [10] })
    expect(cursor().config).toMatchObject({ rowMode: 'array' })
  })

  it('should read up to maxRows, then one more row to learn that the result was cut', async () => {
    serveRows(2000)
    const sut = await connected()

    const result = await sut.execute({ sql: 'SELECT n', maxRows: 1200, onRows: vi.fn() }).result

    expect(result.rows).toHaveLength(1200)
    expect(result.isTruncated).toBe(true)
    expect(cursor().reads).toStrictEqual([500, 500, 200, 1])
    expect(cursor().isClosed).toBe(true)
  })

  it('should not flag a result that fills maxRows exactly', async () => {
    serveRows(3)
    const sut = await connected()

    const result = await sut.execute({ sql: 'SELECT n', maxRows: 3, onRows: vi.fn() }).result

    expect(result).toMatchObject({ rows: [[1], [2], [3]], isTruncated: false })
    expect(cursor().reads).toStrictEqual([3, 1])
  })

  it.each([
    { command: 'UPDATE', rowCount: 3, affectedRows: 3 },
    { command: 'CREATE', rowCount: null, affectedRows: undefined },
  ])('should report the rows a $command changed', async ({ command, rowCount, affectedRows }) => {
    pg.script.read = () => ({ command, rowCount })
    const sut = await connected()

    await expect(
      sut.execute({ sql: command, maxRows: 10, onRows: vi.fn() }).result,
    ).resolves.toStrictEqual({
      columns: [],
      rows: [],
      isTruncated: false,
      affectedRows,
    })
  })

  it('should show the server message and leave the cursor to the server', async () => {
    pg.script.read = () => ({ error: new Error('relation "missing" does not exist') })
    const sut = await connected()

    await expect(
      sut.execute({ sql: 'SELECT * FROM missing', maxRows: 10, onRows: vi.fn() }).result,
    ).rejects.toThrow('relation "missing" does not exist')
    expect(cursor().isClosed).toBe(false)
  })

  it('should close the cursor when the consumer of the rows fails', async () => {
    serveRows(5)
    const sut = await connected()

    const execution = sut.execute({
      sql: 'SELECT n',
      maxRows: 10,
      onRows: () => {
        throw new Error('the grid broke')
      },
    })

    await expect(execution.result).rejects.toThrow('the grid broke')
    expect(cursor().isClosed).toBe(true)
  })

  it('should refuse a row that is not a list of values and close the cursor', async () => {
    pg.script.read = () => ({ rows: [{ n: 1 }] })
    const sut = await connected()

    await expect(
      sut.execute({ sql: 'SELECT n', maxRows: 10, onRows: vi.fn() }).result,
    ).rejects.toThrow(new TypeError('The server sent a row that is not a list of values'))
    expect(cursor().isClosed).toBe(true)
  })

  describe('cancel', () => {
    it('should reject the result as cancelled when the server stops the statement', async () => {
      pg.script.read = () => ({ error: new Error('canceling statement due to user request') })
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT pg_sleep(10)', maxRows: 1, onRows: vi.fn() })

      await Promise.all([execution.cancel(), execution.cancel()])

      await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
      expect(pg.clients.filter(hasCancelled)).toHaveLength(1)
    })

    it('should reject the result as cancelled even when the statement finished first', async () => {
      serveRows(1)
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT 1', maxRows: 1, onRows: vi.fn() })

      await execution.cancel()

      await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
    })

    it('should do nothing once the statement ended', async () => {
      serveRows(1)
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT 1', maxRows: 1, onRows: vi.fn() })
      await execution.result

      await execution.cancel()

      expect(pg.clients).toHaveLength(1)
    })
  })
})
