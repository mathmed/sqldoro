import { beforeEach, describe, expect, it, vi } from 'vitest'

import { firstCursor, NUMBERS, pg, pgRequest, serveRows } from '../../../test/fakes/pg.ts'
import { queryRequest } from '../../../test/fakes/query-request.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { Row } from '../../core/engine/query.ts'
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
    const events: string[] = []
    const batches: (readonly Row[])[] = []

    const result = await sut.execute(
      queryRequest({
        sql: 'SELECT n WHERE $1',
        values: [true],
        maxRows: 10,
        onColumns: (columns) => events.push(`columns ${String(columns.length)}`),
        onRows: (rows) => {
          events.push(`rows ${String(rows.length)}`)
          batches.push(rows)
        },
      }),
    ).result

    expect(events).toStrictEqual(['columns 2', 'rows 2'])
    expect(firstCursor().values).toStrictEqual([true])
    expect(result).toStrictEqual({
      columns: [
        { name: 'n', dataType: 'INT4', kind: 'number' },
        { name: 'x', dataType: 'UNKNOWN', kind: 'other' },
      ],
      rows: [[1], [2]],
      isTruncated: false,
      affectedRows: undefined,
    })
    expect(batches).toStrictEqual([[[1], [2]]])
    expect(firstCursor()).toMatchObject({ sql: 'SELECT n WHERE $1', isClosed: true, reads: [10] })
    expect(firstCursor().config).toMatchObject({ rowMode: 'array' })
  })

  it('should read up to maxRows, then one more row to learn that the result was cut', async () => {
    serveRows(2000)
    const sut = await connected()

    const result = await sut.execute(
      queryRequest({
        sql: 'SELECT n',
        maxRows: 1200,
        onRows: vi.fn(),
      }),
    ).result

    expect(result.rows).toHaveLength(1200)
    expect(result.isTruncated).toBe(true)
    expect(firstCursor().reads).toStrictEqual([500, 500, 200, 1])
    expect(firstCursor().isClosed).toBe(true)
  })

  it('should not flag a result that fills maxRows exactly', async () => {
    serveRows(3)
    const sut = await connected()

    const result = await sut.execute(
      queryRequest({
        sql: 'SELECT n',
        maxRows: 3,
        onRows: vi.fn(),
      }),
    ).result

    expect(result).toMatchObject({ rows: [[1], [2], [3]], isTruncated: false })
    expect(firstCursor().reads).toStrictEqual([3, 1])
  })

  it.each([
    { command: 'UPDATE', rowCount: 3, affectedRows: 3 },
    { command: 'CREATE', rowCount: null, affectedRows: undefined },
  ])('should report the rows a $command changed', async ({ command, rowCount, affectedRows }) => {
    pg.script.read = () => ({ command, rowCount })
    const sut = await connected()

    await expect(
      sut.execute(
        queryRequest({
          sql: command,
          maxRows: 10,
          onRows: vi.fn(),
        }),
      ).result,
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
      sut.execute(
        queryRequest({
          sql: 'SELECT * FROM missing',
          maxRows: 10,
          onRows: vi.fn(),
        }),
      ).result,
    ).rejects.toThrow(new Error('relation "missing" does not exist'))
    expect(firstCursor().isClosed).toBe(false)
  })

  it('should say at which character of the statement the server found the error', async () => {
    const error = Object.assign(new Error('syntax error at or near "FORM"'), { position: '10' })
    pg.script.read = () => ({ error })
    const sut = await connected()

    await expect(
      sut.execute(queryRequest({ sql: 'SELECT * FORM t' })).result,
    ).rejects.toMatchObject({
      name: 'QueryError',
      message: 'syntax error at or near "FORM"',
      location: { kind: 'offset', offset: 9 },
      cause: error,
    })
  })

  it('should close the cursor when the consumer of the rows fails', async () => {
    serveRows(5)
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

    await expect(execution.result).rejects.toThrow('the grid broke')
    expect(firstCursor().isClosed).toBe(true)
  })

  it('should refuse a row that is not a list of values and close the cursor', async () => {
    pg.script.read = () => ({ rows: [{ n: 1 }] })
    const sut = await connected()

    await expect(
      sut.execute(
        queryRequest({
          sql: 'SELECT n',
          maxRows: 10,
          onRows: vi.fn(),
        }),
      ).result,
    ).rejects.toThrow(new TypeError('The server sent a row that is not a list of values'))
    expect(firstCursor().isClosed).toBe(true)
  })
})
