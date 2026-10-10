import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { connectRequest, POSTGRES, waitUntilReady } from '../../../test/integration/servers.ts'
import type { EngineSession, TlsSettings } from '../../core/engine/engine.ts'
import { QueryCancelledError, type Row } from '../../core/engine/query.ts'
import { postgresEngine } from './postgres-engine.ts'

const SCHEMA = 'it_shop'
const SCOPE = { database: POSTGRES.database, schema: SCHEMA }
const FIXTURE = [
  `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`,
  `CREATE SCHEMA ${SCHEMA}`,
  `CREATE TABLE ${SCHEMA}.customers (
    id bigint PRIMARY KEY,
    region char(2) NOT NULL,
    email varchar(255) NOT NULL DEFAULT 'none' UNIQUE
  )`,
  `CREATE TABLE ${SCHEMA}.orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id bigint NOT NULL,
    total numeric(20, 6),
    created_at timestamptz,
    payload jsonb,
    raw bytea,
    CONSTRAINT orders_customer FOREIGN KEY (customer_id) REFERENCES ${SCHEMA}.customers (id)
      ON DELETE CASCADE ON UPDATE RESTRICT
  )`,
  `CREATE INDEX orders_customer_created ON ${SCHEMA}.orders (customer_id, created_at)`,
  `CREATE INDEX customers_lower_region ON ${SCHEMA}.customers (lower(region))`,
  `CREATE VIEW ${SCHEMA}.order_totals AS SELECT customer_id, sum(total) AS total FROM ${SCHEMA}.orders GROUP BY customer_id`,
  `CREATE MATERIALIZED VIEW ${SCHEMA}.customer_count AS SELECT count(*) AS customers FROM ${SCHEMA}.customers`,
]
const REQUIRED_TLS: TlsSettings = {
  serverName: POSTGRES.endpoint.host,
  shouldVerifyCertificate: false,
  shouldVerifyHostname: false,
  ca: undefined,
  cert: undefined,
  key: undefined,
}

let session: EngineSession

async function run(sql: string, maxRows = 100): ReturnType<EngineSession['execute']>['result'] {
  return session.execute({ sql, maxRows, onRows: () => undefined }).result
}

describe('postgresEngine against a real PostgreSQL server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await postgresEngine.connect(connectRequest(POSTGRES))
    })
    for (const statement of FIXTURE) {
      await run(statement)
    }
  })

  afterAll(async () => {
    await session.close()
  })

  it('should report the version of the server and answer a ping', async () => {
    expect(session.serverVersion).toMatch(/^\d+\.\d+/)
    await expect(session.ping()).resolves.toBeUndefined()
  })

  it('should show the server message for a wrong password', async () => {
    await expect(
      postgresEngine.connect(connectRequest(POSTGRES, { password: 'wrong' })),
    ).rejects.toThrow('password authentication failed for user "sqldoro"')
  })

  it('should connect to the default database of the user when none is given', async () => {
    const other = await postgresEngine.connect(connectRequest(POSTGRES, { database: '' }))

    await expect(other.listSchemas(POSTGRES.user)).resolves.toContainEqual({ name: 'public' })
    await other.close()
  })

  describe('catalog', () => {
    it('should list the databases and the schemas of any of them', async () => {
      await expect(session.listDatabases()).resolves.toEqual(
        expect.arrayContaining([{ name: 'postgres' }, { name: POSTGRES.database }]),
      )
      await expect(session.listSchemas(POSTGRES.database)).resolves.toContainEqual({ name: SCHEMA })
      await expect(session.listSchemas('postgres')).resolves.not.toContainEqual({ name: SCHEMA })
    })

    it('should not list temporary or TOAST schemas', async () => {
      const names = (await session.listSchemas(POSTGRES.database)).map((schema) => schema.name)

      expect(names.filter((name) => name.startsWith('pg_t'))).toStrictEqual([])
    })

    it('should list the tables, the views and the materialized views', async () => {
      await expect(session.listTables(SCOPE)).resolves.toStrictEqual([
        { name: 'customers' },
        { name: 'orders' },
      ])
      await expect(session.listViews(SCOPE)).resolves.toStrictEqual([
        { name: 'customer_count', isMaterialized: true },
        { name: 'order_totals', isMaterialized: false },
      ])
    })

    it('should describe the columns in their order', async () => {
      await expect(session.listColumns({ ...SCOPE, name: 'customers' })).resolves.toStrictEqual([
        {
          name: 'id',
          dataType: 'bigint',
          isNullable: false,
          defaultValue: undefined,
          isPrimaryKey: true,
        },
        {
          name: 'region',
          dataType: 'character(2)',
          isNullable: false,
          defaultValue: undefined,
          isPrimaryKey: false,
        },
        {
          name: 'email',
          dataType: 'character varying(255)',
          isNullable: false,
          defaultValue: "'none'::character varying",
          isPrimaryKey: false,
        },
      ])
    })

    it('should describe the columns of a view', async () => {
      await expect(session.listColumns({ ...SCOPE, name: 'order_totals' })).resolves.toMatchObject([
        { name: 'customer_id', isPrimaryKey: false },
        { name: 'total', dataType: 'numeric' },
      ])
    })

    it('should list the primary key first, then the indexes with their columns or expressions', async () => {
      await expect(session.listIndexes({ ...SCOPE, name: 'orders' })).resolves.toStrictEqual([
        { name: 'orders_pkey', columns: ['id'], isUnique: true, isPrimary: true },
        {
          name: 'orders_customer_created',
          columns: ['customer_id', 'created_at'],
          isUnique: false,
          isPrimary: false,
        },
      ])
      await expect(session.listIndexes({ ...SCOPE, name: 'customers' })).resolves.toContainEqual({
        name: 'customers_lower_region',
        columns: ['lower(region::text)'],
        isUnique: false,
        isPrimary: false,
      })
    })

    it('should describe the foreign keys and their rules', async () => {
      await expect(session.listForeignKeys({ ...SCOPE, name: 'orders' })).resolves.toStrictEqual([
        {
          name: 'orders_customer',
          columns: ['customer_id'],
          referencedSchema: SCHEMA,
          referencedTable: 'customers',
          referencedColumns: ['id'],
          onUpdate: 'RESTRICT',
          onDelete: 'CASCADE',
        },
      ])
    })
  })

  describe('execute', () => {
    it('should keep exact numbers, dates and JSON as the server sends them', async () => {
      await run(`INSERT INTO ${SCHEMA}.customers VALUES (9007199254740993, 'BR', 'a@example.com')`)
      await run(`INSERT INTO ${SCHEMA}.orders (customer_id, total, created_at, payload, raw)
        VALUES (9007199254740993, 12345678901234.123456, '2024-02-29 23:59:59.123+00', '{"b": 1}', '\\x00ff'),
               (9007199254740993, NULL, NULL, NULL, NULL)`)

      const result = await run(
        `SELECT customer_id, total, created_at AT TIME ZONE 'UTC' AS created_at, payload, raw, total IS NULL AS missing
         FROM ${SCHEMA}.orders ORDER BY id`,
      )

      expect(result.columns).toStrictEqual([
        { name: 'customer_id', dataType: 'INT8' },
        { name: 'total', dataType: 'NUMERIC' },
        { name: 'created_at', dataType: 'TIMESTAMP' },
        { name: 'payload', dataType: 'JSONB' },
        { name: 'raw', dataType: 'BYTEA' },
        { name: 'missing', dataType: 'BOOL' },
      ])
      expect(result.rows).toStrictEqual([
        [
          '9007199254740993',
          '12345678901234.123456',
          '2024-02-29 23:59:59.123',
          '{"b": 1}',
          '\\x00ff',
          false,
        ],
        ['9007199254740993', null, null, null, null, true],
      ])
    })

    it('should report the rows a statement changed', async () => {
      await expect(run(`UPDATE ${SCHEMA}.customers SET region = 'PT'`)).resolves.toMatchObject({
        affectedRows: 1,
        rows: [],
      })
    })

    it('should keep at most maxRows rows, flag the result as truncated and stream them in batches', async () => {
      const batches: (readonly Row[])[] = []

      const result = await session.execute({
        sql: 'SELECT generate_series(1, 1000) AS n',
        maxRows: 600,
        onRows: (rows) => batches.push(rows),
      }).result

      expect(result.rows).toHaveLength(600)
      expect(result.isTruncated).toBe(true)
      expect(batches.map((batch) => batch.length)).toStrictEqual([500, 100])
    })

    it('should not flag a result that fits maxRows', async () => {
      await expect(run('SELECT generate_series(1, 3) AS n', 3)).resolves.toMatchObject({
        rows: [[1], [2], [3]],
        isTruncated: false,
      })
    })

    it('should show the server message of a failed statement', async () => {
      await expect(run('SELECT * FROM it_missing_table')).rejects.toThrow(
        'relation "it_missing_table" does not exist',
      )
    })

    it('should cancel a running statement and stay usable', async () => {
      const execution = session.execute({
        sql: 'SELECT pg_sleep(20)',
        maxRows: 1,
        onRows: () => undefined,
      })
      await new Promise((resolve) => setTimeout(resolve, 200))

      await execution.cancel()

      await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
      await expect(run('SELECT 1 AS one')).resolves.toMatchObject({ rows: [[1]] })
    })

    it('should stay usable after the consumer of the rows fails', async () => {
      const execution = session.execute({
        sql: 'SELECT generate_series(1, 2000)',
        maxRows: 5000,
        onRows: () => {
          throw new Error('the consumer broke')
        },
      })

      await expect(execution.result).rejects.toThrow('the consumer broke')
      await expect(run('SELECT 2 AS two')).resolves.toMatchObject({ rows: [[2]] })
    })
  })

  it('should explain that the server does not support SSL', async () => {
    await expect(
      postgresEngine.connect(connectRequest(POSTGRES, { tls: REQUIRED_TLS })),
    ).rejects.toThrow('The server does not support SSL connections')
  })

  it('should report a connection the server ends', async () => {
    const onUnexpectedClose = vi.fn()
    const victim = await postgresEngine.connect(connectRequest(POSTGRES, { onUnexpectedClose }))
    const [row] = (
      await victim.execute({ sql: 'SELECT pg_backend_pid()', maxRows: 1, onRows: () => undefined })
        .result
    ).rows

    await run(`SELECT pg_terminate_backend(${String(row?.[0])})`)

    await vi.waitFor(() => {
      expect(onUnexpectedClose).toHaveBeenCalledOnce()
    })
    await victim.close().catch(() => undefined)
  })
})
