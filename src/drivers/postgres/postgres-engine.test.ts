import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, pg, pgRequest } from '../../../test/fakes/pg.ts'
import type { ConnectRequest, EngineSession } from '../../core/engine/engine.ts'
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

const SCOPE = { database: 'shop', schema: 'public' }
const TABLE = { ...SCOPE, name: 'orders' }

async function connected(changes: Partial<ConnectRequest> = {}): Promise<EngineSession> {
  return postgresEngine.connect(pgRequest(changes))
}

beforeEach(() => {
  pg.reset()
})

describe('postgresEngine', () => {
  it('should describe PostgreSQL', () => {
    expect(postgresEngine).toMatchObject({
      id: 'postgres',
      displayName: 'PostgreSQL',
      defaultPort: 5432,
      urlSchemes: ['postgres', 'postgresql'],
      dialect: { identifierQuote: '"', hasSchemas: true },
    })
  })

  describe('connect', () => {
    it('should describe the session', async () => {
      const sut = await connected()

      expect(sut.serverVersion).toBe('18.6')
      expect(pg.clients[0]?.config).toMatchObject({ database: 'shop' })
    })

    it('should refuse a session the server does not describe', async () => {
      answerBy([['SELECT current_setting', { rows: [] }]])

      await expect(connected()).rejects.toThrow(
        new TypeError('PostgreSQL did not describe the session'),
      )
      expect(pg.clients[0]?.isEnded).toBe(true)
    })

    it('should close the client when the session cannot be described, even if closing fails', async () => {
      const onUnexpectedClose = vi.fn()
      answerBy([['SELECT current_setting', { error: new Error('permission denied') }]])
      pg.script.endError = new Error('already closed')

      await expect(connected({ onUnexpectedClose })).rejects.toThrow('permission denied')
      pg.clients[0]?.emit('error', new Error('terminated'))

      expect(pg.clients[0]?.isEnded).toBe(true)
      expect(onUnexpectedClose).not.toHaveBeenCalled()
    })

    it('should show why the server refused the connection', async () => {
      pg.script.connectError = new Error('database "shop" does not exist')

      await expect(connected()).rejects.toThrow('database "shop" does not exist')
    })
  })

  describe('session', () => {
    it('should answer a ping', async () => {
      const sut = await connected()

      await sut.ping()

      expect(pg.clients[0]?.queries.at(-1)).toStrictEqual({ sql: 'SELECT 1', values: [] })
    })

    it('should report a connection the server ends, but not one close() ends', async () => {
      const onUnexpectedClose = vi.fn()
      const sut = await connected({ onUnexpectedClose })
      const lost = new Error('terminating connection due to administrator command')

      pg.clients[0]?.emit('error', lost)
      await sut.close()
      pg.clients[0]?.emit('error', new Error('Connection terminated'))

      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(lost)
    })

    it('should close every client it opened, and skip the ones that never opened', async () => {
      const sut = await connected()
      await sut.listSchemas('analytics')
      pg.script.connectError = new Error('database "broken" does not exist')
      await expect(sut.listSchemas('broken')).rejects.toThrow('database "broken" does not exist')
      pg.script.connectError = undefined

      await sut.close()

      expect(pg.clients.map((client) => client.isEnded)).toStrictEqual([true, true, false])
    })
  })

  it('should not keep a database that fails to open while the session closes', async () => {
    const sut = await connected()
    pg.script.connectError = new Error('too many connections')

    const opening = sut.listSchemas('analytics')
    await sut.close()

    await expect(opening).rejects.toThrow('too many connections')
    expect(pg.clients.map((client) => client.isEnded)).toStrictEqual([true, false])
  })

  describe('catalog', () => {
    it('should list the databases with the session client', async () => {
      answerBy([['SELECT datname', { rows: [{ name: 'postgres' }, { name: 'shop' }] }]])
      const sut = await connected()

      await expect(sut.listDatabases()).resolves.toStrictEqual([
        { name: 'postgres' },
        { name: 'shop' },
      ])
      expect(pg.clients).toHaveLength(1)
    })

    it('should open one client per database, on first use', async () => {
      answerBy([['SELECT nspname', { rows: [{ name: 'public' }] }]])
      const sut = await connected()

      await expect(sut.listSchemas('shop')).resolves.toStrictEqual([{ name: 'public' }])
      await sut.listSchemas('analytics')
      await sut.listSchemas('analytics')

      expect(pg.clients.map((client) => client.config.database)).toStrictEqual([
        'shop',
        'analytics',
      ])
    })

    it('should try again to open a database that failed to open', async () => {
      const sut = await connected()
      pg.script.connectError = new Error('too many connections')
      await expect(sut.listSchemas('analytics')).rejects.toThrow('too many connections')
      pg.script.connectError = undefined

      await expect(sut.listSchemas('analytics')).resolves.toStrictEqual([])
      expect(pg.clients).toHaveLength(3)
    })

    it('should list the tables and the views of a schema', async () => {
      answerBy([
        ['SELECT c.relname AS name FROM', { rows: [{ name: 'orders' }] }],
        [
          'SELECT c.relname AS name, c.relkind',
          { rows: [{ name: 'totals', isMaterialized: true }] },
        ],
      ])
      const sut = await connected()

      await expect(sut.listTables(SCOPE)).resolves.toStrictEqual([{ name: 'orders' }])
      await expect(sut.listViews(SCOPE)).resolves.toStrictEqual([
        { name: 'totals', isMaterialized: true },
      ])
      expect(pg.clients[0]?.queries.slice(1).map((query) => query.values)).toStrictEqual([
        ['public'],
        ['public'],
      ])
    })

    it('should describe the columns', async () => {
      answerBy([
        [
          'SELECT a.attname',
          {
            rows: [
              {
                name: 'id',
                dataType: 'bigint',
                isNullable: false,
                defaultValue: null,
                isPrimaryKey: true,
              },
              {
                name: 'note',
                dataType: 'text',
                isNullable: true,
                defaultValue: "'none'::text",
                isPrimaryKey: false,
              },
            ],
          },
        ],
      ])
      const sut = await connected()

      await expect(sut.listColumns(TABLE)).resolves.toStrictEqual([
        {
          name: 'id',
          dataType: 'bigint',
          isNullable: false,
          defaultValue: undefined,
          isPrimaryKey: true,
        },
        {
          name: 'note',
          dataType: 'text',
          isNullable: true,
          defaultValue: "'none'::text",
          isPrimaryKey: false,
        },
      ])
      expect(pg.clients[0]?.queries.at(-1)?.values).toStrictEqual(['public', 'orders'])
    })

    it('should gather the columns of each index', async () => {
      answerBy([
        [
          'SELECT i.relname',
          {
            rows: [
              { indexName: 'orders_pkey', columnName: 'id', isUnique: true, isPrimary: true },
              {
                indexName: 'by_customer',
                columnName: 'customer_id',
                isUnique: false,
                isPrimary: false,
              },
              {
                indexName: 'by_customer',
                columnName: 'lower(note)',
                isUnique: false,
                isPrimary: false,
              },
            ],
          },
        ],
      ])
      const sut = await connected()

      await expect(sut.listIndexes(TABLE)).resolves.toStrictEqual([
        { name: 'orders_pkey', columns: ['id'], isUnique: true, isPrimary: true },
        {
          name: 'by_customer',
          columns: ['customer_id', 'lower(note)'],
          isUnique: false,
          isPrimary: false,
        },
      ])
    })

    it('should describe the foreign keys', async () => {
      const row = {
        constraintName: 'orders_customer',
        columnName: 'customer_id',
        referencedSchema: 'public',
        referencedTable: 'customers',
        referencedColumn: 'id',
        onUpdate: 'NO ACTION',
        onDelete: 'SET NULL',
      }
      answerBy([['SELECT c.conname', { rows: [row] }]])
      const sut = await connected()

      await expect(sut.listForeignKeys(TABLE)).resolves.toStrictEqual([
        {
          name: 'orders_customer',
          columns: ['customer_id'],
          referencedSchema: 'public',
          referencedTable: 'customers',
          referencedColumns: ['id'],
          onUpdate: 'NO ACTION',
          onDelete: 'SET NULL',
        },
      ])
    })

    it('should refuse rows of the wrong shape', async () => {
      answerBy([['SELECT datname', { rows: [{ name: null }] }]])
      const sut = await connected()

      await expect(sut.listDatabases()).rejects.toThrow(new TypeError('"name" must be a string'))
    })
  })

  describe('cancel', () => {
    it('should cancel the backend of the session from another connection', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT pg_sleep(10)', maxRows: 1, onRows: vi.fn() })

      await execution.cancel()

      expect(pg.clients[1]?.config).toMatchObject({ database: 'shop' })
      expect(pg.clients[1]?.queries).toStrictEqual([
        { sql: 'SELECT pg_cancel_backend($1)', values: [4242] },
      ])
      expect(pg.clients[1]?.isEnded).toBe(true)
      await expect(execution.result).rejects.toThrow('The query was cancelled')
    })

    it('should say why the cancel failed, after closing its connection', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT pg_sleep(10)', maxRows: 1, onRows: vi.fn() })
      answerBy([['SELECT pg_cancel_backend', { error: new Error('must be a superuser') }]])

      await expect(execution.cancel()).rejects.toThrow('must be a superuser')
      expect(pg.clients[1]?.isEnded).toBe(true)
    })

    it('should say why the cancel connection failed', async () => {
      const sut = await connected()
      const execution = sut.execute({ sql: 'SELECT pg_sleep(10)', maxRows: 1, onRows: vi.fn() })
      pg.script.answer = (query, client) => {
        client.emit('error', new Error('Connection terminated unexpectedly'))
        return { rows: query.values.length > 0 ? [{ pg_cancel_backend: true }] : [] }
      }

      await expect(execution.cancel()).rejects.toThrow('Connection terminated unexpectedly')
    })
  })
})
