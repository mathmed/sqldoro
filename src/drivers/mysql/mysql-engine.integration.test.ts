import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { connectRequest, MYSQL, waitUntilReady } from '../../../test/integration/servers.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { QueryCancelledError, type Row } from '../../core/engine/query.ts'
import { mysqlEngine } from './mysql-engine.ts'

const SCOPE = { database: MYSQL.database, schema: MYSQL.database }
const FIXTURE = [
  'DROP VIEW IF EXISTS it_order_totals',
  'DROP TABLE IF EXISTS it_orders',
  'DROP TABLE IF EXISTS it_customers',
  `CREATE TABLE it_customers (
    id BIGINT PRIMARY KEY,
    region CHAR(2) NOT NULL,
    email VARCHAR(255) NOT NULL DEFAULT 'none',
    UNIQUE KEY it_customers_email (email)
  )`,
  `CREATE TABLE it_orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    customer_id BIGINT NOT NULL,
    total DECIMAL(20, 6),
    created_at DATETIME(3),
    payload JSON,
    raw VARBINARY(8),
    KEY it_orders_customer_created (customer_id, created_at),
    CONSTRAINT it_orders_customer FOREIGN KEY (customer_id) REFERENCES it_customers (id)
      ON DELETE CASCADE ON UPDATE RESTRICT
  )`,
  'CREATE VIEW it_order_totals AS SELECT customer_id, SUM(total) AS total FROM it_orders GROUP BY customer_id',
]

let session: EngineSession

async function run(sql: string, maxRows = 100): ReturnType<EngineSession['execute']>['result'] {
  return session.execute({ sql, maxRows, onRows: () => undefined }).result
}

describe('mysqlEngine against a real MySQL server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await mysqlEngine.connect(connectRequest(MYSQL))
    })
    for (const statement of FIXTURE) {
      await run(statement)
    }
  })

  afterAll(async () => {
    await session.close()
  })

  it('should report the version of the server and answer a ping', async () => {
    expect(session.serverVersion).toMatch(/^\d+\.\d+\.\d+/)
    await expect(session.ping()).resolves.toBeUndefined()
  })

  it('should show the server message for a wrong password', async () => {
    await expect(mysqlEngine.connect(connectRequest(MYSQL, { password: 'wrong' }))).rejects.toThrow(
      /Access denied for user 'sqldoro'/,
    )
  })

  it('should show the server message for an unknown database', async () => {
    await expect(
      mysqlEngine.connect(connectRequest(MYSQL, { database: 'it_missing' })),
    ).rejects.toThrow(/Unknown database 'it_missing'|Access denied/)
  })

  describe('catalog', () => {
    it('should list the databases and no schemas', async () => {
      await expect(session.listDatabases()).resolves.toContainEqual({ name: MYSQL.database })
      await expect(session.listSchemas(MYSQL.database)).resolves.toStrictEqual([])
    })

    it('should list the tables and the views apart', async () => {
      const tables = await session.listTables(SCOPE)
      const views = await session.listViews(SCOPE)

      expect(tables).toEqual(
        expect.arrayContaining([{ name: 'it_customers' }, { name: 'it_orders' }]),
      )
      expect(tables).not.toContainEqual({ name: 'it_order_totals' })
      expect(views).toContainEqual({ name: 'it_order_totals', isMaterialized: false })
    })

    it('should describe the columns in their order', async () => {
      const columns = await session.listColumns({ ...SCOPE, name: 'it_customers' })

      expect(columns).toStrictEqual([
        {
          name: 'id',
          dataType: 'bigint',
          isNullable: false,
          defaultValue: undefined,
          isPrimaryKey: true,
        },
        {
          name: 'region',
          dataType: 'char(2)',
          isNullable: false,
          defaultValue: undefined,
          isPrimaryKey: false,
        },
        {
          name: 'email',
          dataType: 'varchar(255)',
          isNullable: false,
          defaultValue: 'none',
          isPrimaryKey: false,
        },
      ])
    })

    it('should list the primary key first, then the indexes with their columns in order', async () => {
      await expect(session.listIndexes({ ...SCOPE, name: 'it_orders' })).resolves.toStrictEqual([
        { name: 'PRIMARY', columns: ['id'], isUnique: true, isPrimary: true },
        {
          name: 'it_orders_customer_created',
          columns: ['customer_id', 'created_at'],
          isUnique: false,
          isPrimary: false,
        },
      ])
      await expect(session.listIndexes({ ...SCOPE, name: 'it_customers' })).resolves.toContainEqual(
        {
          name: 'it_customers_email',
          columns: ['email'],
          isUnique: true,
          isPrimary: false,
        },
      )
    })

    it('should describe the foreign keys and their rules', async () => {
      await expect(session.listForeignKeys({ ...SCOPE, name: 'it_orders' })).resolves.toStrictEqual(
        [
          {
            name: 'it_orders_customer',
            columns: ['customer_id'],
            referencedSchema: MYSQL.database,
            referencedTable: 'it_customers',
            referencedColumns: ['id'],
            onUpdate: 'RESTRICT',
            onDelete: 'CASCADE',
          },
        ],
      )
    })
  })

  describe('execute', () => {
    it('should keep exact numbers, dates and JSON as the server sends them', async () => {
      await run("INSERT INTO it_customers VALUES (9007199254740993, 'BR', 'a@example.com')")
      await run(`INSERT INTO it_orders (customer_id, total, created_at, payload, raw)
        VALUES (9007199254740993, 12345678901234.123456, '2024-02-29 23:59:59.123', '{"b": 1}', 0x00ff), (9007199254740993, NULL, NULL, NULL, NULL)`)

      const result = await run(
        'SELECT customer_id, total, created_at, payload, raw FROM it_orders ORDER BY id',
      )

      expect(result.columns.map((column) => column.name)).toStrictEqual([
        'customer_id',
        'total',
        'created_at',
        'payload',
        'raw',
      ])
      expect(result.rows).toStrictEqual([
        [
          '9007199254740993',
          '12345678901234.123456',
          '2024-02-29 23:59:59.123',
          '{"b": 1}',
          '0x00ff',
        ],
        ['9007199254740993', null, null, null, null],
      ])
    })

    it('should report the rows a statement changed', async () => {
      await expect(run("UPDATE it_customers SET region = 'PT'")).resolves.toMatchObject({
        affectedRows: 1,
        rows: [],
      })
    })

    it('should keep at most maxRows rows, flag the result as truncated and stream them in batches', async () => {
      const batches: (readonly Row[])[] = []
      const sql =
        'SELECT n FROM (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3) AS numbers ORDER BY n'

      const result = await session.execute({
        sql,
        maxRows: 2,
        onRows: (rows) => batches.push(rows),
      }).result

      expect(result).toMatchObject({ rows: [['1'], ['2']], isTruncated: true })
      expect(batches.flat()).toStrictEqual([['1'], ['2']])
    })

    it('should show the server message of a failed statement', async () => {
      await expect(run('SELECT * FROM it_missing_table')).rejects.toThrow(
        /it_missing_table' doesn't exist/,
      )
    })

    it('should cancel a running statement and stay usable', async () => {
      const execution = session.execute({
        sql: 'SELECT SLEEP(20)',
        maxRows: 1,
        onRows: () => undefined,
      })
      await new Promise((resolve) => setTimeout(resolve, 200))

      await execution.cancel()

      await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
      await expect(run('SELECT 1 AS one')).resolves.toMatchObject({ rows: [['1']] })
    })

    it('should ignore a cancel that comes after the end', async () => {
      const execution = session.execute({ sql: 'SELECT 1', maxRows: 1, onRows: () => undefined })
      await execution.result

      await expect(execution.cancel()).resolves.toBeUndefined()
    })
  })

  describe('TLS', () => {
    it('should encrypt the connection when SSL is required', async () => {
      const tls = {
        serverName: MYSQL.endpoint.host,
        shouldVerifyCertificate: false,
        shouldVerifyHostname: false,
        ca: undefined,
        cert: undefined,
        key: undefined,
      }
      const encrypted = await mysqlEngine.connect(connectRequest(MYSQL, { tls }))

      const result = await encrypted.execute({
        sql: "SHOW SESSION STATUS LIKE 'Ssl_cipher'",
        maxRows: 1,
        onRows: () => undefined,
      }).result
      await encrypted.close()

      expect(result.rows[0]?.[1]).toMatch(/\w+/)
    })

    it('should refuse a certificate it cannot verify', async () => {
      const tls = {
        serverName: MYSQL.endpoint.host,
        shouldVerifyCertificate: true,
        shouldVerifyHostname: false,
        ca: undefined,
        cert: undefined,
        key: undefined,
      }

      await expect(mysqlEngine.connect(connectRequest(MYSQL, { tls }))).rejects.toThrow(
        /certificate/i,
      )
    })
  })

  it('should report a connection the server ends', async () => {
    const onUnexpectedClose = vi.fn()
    const victim = await mysqlEngine.connect(connectRequest(MYSQL, { onUnexpectedClose }))
    const [row] = (
      await victim.execute({ sql: 'SELECT CONNECTION_ID()', maxRows: 1, onRows: () => undefined })
        .result
    ).rows

    await run(`KILL CONNECTION ${String(row?.[0])}`)

    await vi.waitFor(() => {
      expect(onUnexpectedClose).toHaveBeenCalledOnce()
    })
    await victim.close()
  })
})
