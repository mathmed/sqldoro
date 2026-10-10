import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, mysql, mysqlRequest } from '../../../test/fakes/mysql2.ts'
import type { ConnectRequest, EngineSession } from '../../core/engine/engine.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { mysqlEngine, statusOf } from './mysql-engine.ts'

vi.mock('mysql2', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { createConnection } = await import('../../../test/fakes/mysql2.ts')
  return { default: { ...original.default, createConnection } }
})

const SCOPE = { database: 'shop', schema: 'shop' }
const TABLE = { ...SCOPE, name: 'orders' }

async function connected(changes: Partial<ConnectRequest> = {}): Promise<EngineSession> {
  return mysqlEngine.connect(mysqlRequest(changes))
}

beforeEach(() => {
  mysql.reset()
  answerBy()
})

describe('mysqlEngine', () => {
  it('should describe MySQL', () => {
    expect(mysqlEngine).toMatchObject({
      id: 'mysql',
      displayName: 'MySQL',
      defaultPort: 3306,
      urlSchemes: ['mysql'],
      dialect: { identifierQuote: '`', hasSchemas: false },
    })
  })

  describe('connect', () => {
    it('should read the version of the server', async () => {
      const sut = await connected()

      expect(sut.serverVersion).toBe('8.4.11')
      expect(mysql.connections[0]?.queries[0]).toStrictEqual({
        sql: 'SELECT VERSION() AS version',
        values: [],
      })
    })

    it('should leave the version empty when the server does not say it', async () => {
      mysql.script.answer = () => ({ result: [] })

      await expect(connected()).resolves.toMatchObject({ serverVersion: '' })
    })

    it('should drop the connection when the version cannot be read', async () => {
      const onUnexpectedClose = vi.fn()
      mysql.script.answer = () => ({ error: new Error('Lost connection') })

      await expect(connected({ onUnexpectedClose })).rejects.toThrow('Lost connection')
      mysql.connections[0]?.emit('error', new Error('Lost connection'))

      expect(mysql.connections[0]?.isDestroyed).toBe(true)
      expect(onUnexpectedClose).not.toHaveBeenCalled()
    })

    it('should make every transaction of a read-only session read-only', async () => {
      await connected({ isReadOnly: true })

      expect(mysql.connections[0]?.queries.map((query) => query.sql)).toStrictEqual([
        'SELECT VERSION() AS version',
        'SET SESSION TRANSACTION READ ONLY',
      ])
    })

    it('should leave a writable session as the server opens it', async () => {
      await connected({ isReadOnly: false })

      expect(mysql.connections[0]?.queries).toHaveLength(1)
    })

    it('should drop a read-only session that the server cannot make read-only', async () => {
      answerBy([['SET SESSION', { error: new Error('Unknown system variable') }]])

      await expect(connected({ isReadOnly: true })).rejects.toThrow('Unknown system variable')
      expect(mysql.connections[0]?.isDestroyed).toBe(true)
    })

    it('should show why the server refused the connection', async () => {
      mysql.script.connectError = new Error("Access denied for user 'app'@'%'")

      await expect(connected()).rejects.toThrow("Access denied for user 'app'@'%'")
    })
  })

  describe('transactionStatus', () => {
    it('should ask the server with a statement that does nothing', async () => {
      answerBy([['DO 0', { result: { affectedRows: 0, serverStatus: 3 } }]])
      const sut = await connected()

      await expect(sut.transactionStatus()).resolves.toBe(TransactionStatus.Open)
      expect(mysql.connections[0]?.queries.at(-1)).toStrictEqual({ sql: 'DO 0', values: [] })
    })

    it.each([
      [{ serverStatus: 2 }, TransactionStatus.Idle],
      [{ serverStatus: 1 }, TransactionStatus.Open],
      [{ serverStatus: 0x2001 }, TransactionStatus.Open],
      [{ serverStatus: '1' }, TransactionStatus.Unknown],
      [{}, TransactionStatus.Unknown],
      [[], TransactionStatus.Unknown],
      [null, TransactionStatus.Unknown],
      ['ok', TransactionStatus.Unknown],
    ])('should read %j as %s', (result, status) => {
      expect(statusOf(result)).toBe(status)
    })
  })

  describe('session', () => {
    it('should answer a ping', async () => {
      const sut = await connected()

      await expect(sut.ping()).resolves.toBeUndefined()
    })

    it('should report a failed ping', async () => {
      const sut = await connected()
      mysql.script.pingError = new Error('Connection lost')

      await expect(sut.ping()).rejects.toThrow('Connection lost')
    })

    it('should report a connection the server ends', async () => {
      const onUnexpectedClose = vi.fn()
      await connected({ onUnexpectedClose })
      const lost = new Error('Connection lost: The server closed the connection.')

      mysql.connections[0]?.emit('error', lost)

      expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(lost)
    })

    it('should end the connection on close without reporting it', async () => {
      const onUnexpectedClose = vi.fn()
      const sut = await connected({ onUnexpectedClose })

      await sut.close()
      mysql.connections[0]?.emit('error', new Error('closed'))

      expect(mysql.connections[0]?.isEnded).toBe(true)
      expect(onUnexpectedClose).not.toHaveBeenCalled()
    })
  })

  describe('catalog', () => {
    it('should list the databases and no schemas', async () => {
      answerBy([
        ['SELECT SCHEMA_NAME', { result: [{ name: 'information_schema' }, { name: 'shop' }] }],
      ])
      const sut = await connected()

      await expect(sut.listDatabases()).resolves.toStrictEqual([
        { name: 'information_schema' },
        { name: 'shop' },
      ])
      await expect(sut.listSchemas('shop')).resolves.toStrictEqual([])
    })

    it('should list the base tables and the views of a schema', async () => {
      answerBy([['SELECT TABLE_NAME', { result: [{ name: 'orders' }] }]])
      const sut = await connected()

      await expect(sut.listTables(SCOPE)).resolves.toStrictEqual([{ name: 'orders' }])
      await expect(sut.listViews(SCOPE)).resolves.toStrictEqual([
        { name: 'orders', isMaterialized: false },
      ])
      expect(mysql.connections[0]?.queries.slice(1).map((query) => query.values)).toStrictEqual([
        ['shop', 'BASE TABLE'],
        ['shop', 'VIEW'],
      ])
    })

    it('should describe the columns', async () => {
      answerBy([
        [
          'SELECT COLUMN_NAME',
          {
            result: [
              {
                name: 'id',
                dataType: 'bigint',
                isNullable: 'NO',
                defaultValue: null,
                isPrimaryKey: 'YES',
              },
              {
                name: 'note',
                dataType: 'text',
                isNullable: 'YES',
                defaultValue: 'none',
                isPrimaryKey: 'NO',
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
          defaultValue: 'none',
          isPrimaryKey: false,
        },
      ])
      expect(mysql.connections[0]?.queries[1]?.values).toStrictEqual(['shop', 'orders'])
    })

    it('should gather the columns of each index', async () => {
      answerBy([
        [
          'SELECT INDEX_NAME',
          {
            result: [
              { indexName: 'PRIMARY', columnName: 'id', isUnique: 'YES', isPrimary: 'YES' },
              {
                indexName: 'by_customer',
                columnName: 'customer_id',
                isUnique: 'NO',
                isPrimary: 'NO',
              },
              {
                indexName: 'by_customer',
                columnName: 'created_at',
                isUnique: 'NO',
                isPrimary: 'NO',
              },
            ],
          },
        ],
      ])
      const sut = await connected()

      await expect(sut.listIndexes(TABLE)).resolves.toStrictEqual([
        { name: 'PRIMARY', columns: ['id'], isUnique: true, isPrimary: true },
        {
          name: 'by_customer',
          columns: ['customer_id', 'created_at'],
          isUnique: false,
          isPrimary: false,
        },
      ])
    })

    it('should describe the foreign keys', async () => {
      const row = {
        constraintName: 'orders_customer',
        columnName: 'customer_id',
        referencedSchema: 'shop',
        referencedTable: 'customers',
        referencedColumn: 'id',
        onUpdate: 'RESTRICT',
        onDelete: 'CASCADE',
      }
      answerBy([['SELECT k.CONSTRAINT_NAME', { result: [row] }]])
      const sut = await connected()

      await expect(sut.listForeignKeys(TABLE)).resolves.toStrictEqual([
        {
          name: 'orders_customer',
          columns: ['customer_id'],
          referencedSchema: 'shop',
          referencedTable: 'customers',
          referencedColumns: ['id'],
          onUpdate: 'RESTRICT',
          onDelete: 'CASCADE',
        },
      ])
    })

    it('should show the server message of a failed catalog query', async () => {
      answerBy([['SELECT SCHEMA_NAME', { error: new Error('SELECT command denied') }]])
      const sut = await connected()

      await expect(sut.listDatabases()).rejects.toThrow('SELECT command denied')
    })

    it('should refuse an answer without rows', async () => {
      answerBy([['SELECT SCHEMA_NAME', { result: { affectedRows: 0 } }]])
      const sut = await connected()

      await expect(sut.listDatabases()).rejects.toThrow(
        new TypeError('The server answered without rows'),
      )
    })

    it('should refuse rows of the wrong shape', async () => {
      answerBy([['SELECT SCHEMA_NAME', { result: [{ name: 7 }] }]])
      const sut = await connected()

      await expect(sut.listDatabases()).rejects.toThrow(new TypeError('"name" must be a string'))
    })
  })
})
