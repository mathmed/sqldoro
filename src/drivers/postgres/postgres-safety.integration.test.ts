import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectRequest, POSTGRES, waitUntilReady } from '../../../test/integration/servers.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { QueryResult } from '../../core/engine/query.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { planLimit } from '../../core/safety/auto-limit.ts'
import { classifyStatement } from '../../core/safety/classify.ts'
import { isHarmless } from '../../core/safety/statement-class.ts'
import { postgresEngine } from './postgres-engine.ts'

const SCHEMA = 'it_safety'
const SCOPE = { database: POSTGRES.database, schema: SCHEMA }
const READ_ONLY_ERROR = /read-only transaction/

let writable: EngineSession
let readOnly: EngineSession
let observer: EngineSession

async function run(session: EngineSession, sql: string, maxRows = 1000): Promise<QueryResult> {
  return session.execute({
    sql,
    values: [],
    maxRows,
    onColumns: () => undefined,
    onRows: () => undefined,
  }).result
}

// COUNT(*) is a bigint, kept as the exact text the server sent.
async function count(): Promise<unknown> {
  const result = await run(observer, 'SELECT COUNT(*) FROM items')
  return result.rows[0]?.[0]
}

describe('postgresEngine safety layers, against a real PostgreSQL server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      writable = await postgresEngine.connect(connectRequest(POSTGRES))
    })
    for (const statement of [
      `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`,
      `CREATE SCHEMA ${SCHEMA}`,
      `CREATE TABLE ${SCHEMA}.items (id int PRIMARY KEY, note text)`,
      `CREATE SEQUENCE ${SCHEMA}.ids`,
    ]) {
      await run(writable, statement)
    }
    await writable.useScope(SCOPE)
    readOnly = await postgresEngine.connect(connectRequest(POSTGRES, { isReadOnly: true }))
    await readOnly.useScope(SCOPE)
    observer = await postgresEngine.connect(connectRequest(POSTGRES))
    await observer.useScope(SCOPE)
  })

  afterAll(async () => {
    await Promise.all([writable.close(), readOnly.close(), observer.close()])
  })

  describe('a read-only session, with the statement checks bypassed', () => {
    it.each([
      'INSERT INTO items VALUES (1, NULL)',
      'UPDATE items SET note = NULL',
      'DELETE FROM items',
      'MERGE INTO items USING (SELECT 1 AS id) s ON items.id = s.id WHEN MATCHED THEN DELETE',
      'WITH d AS (DELETE FROM items RETURNING *) SELECT * FROM d',
      'CREATE TABLE items_new (id int)',
      'CREATE TEMPORARY TABLE scratch (id int)',
      'DROP TABLE items',
      'TRUNCATE items',
      "SELECT nextval('ids')",
      'SELECT * FROM items FOR UPDATE',
    ])('should refuse %s on the server, as the statement checks do', async (sql) => {
      expect(isHarmless(classifyStatement(sql, postgresEngine.dialect))).toBe(false)

      await expect(run(readOnly, sql)).rejects.toThrow(READ_ONLY_ERROR)
    })

    it('should refuse writes in a transaction it opens, and in a database it moves to', async () => {
      await run(readOnly, 'BEGIN')
      await expect(run(readOnly, 'INSERT INTO items VALUES (2, NULL)')).rejects.toThrow(
        READ_ONLY_ERROR,
      )
      await run(readOnly, 'ROLLBACK')
      await readOnly.useScope({ database: 'postgres', schema: '' })
      await expect(run(readOnly, 'CREATE TABLE sqldoro_it_other (id int)')).rejects.toThrow(
        READ_ONLY_ERROR,
      )
      await readOnly.useScope(SCOPE)

      await expect(count()).resolves.toBe('0')
    })

    it('should still read', async () => {
      await expect(run(readOnly, 'SELECT COUNT(*) FROM items')).resolves.toMatchObject({
        rows: [['0']],
      })
    })
  })

  describe('transactions', () => {
    it('should report the transaction and roll it back', async () => {
      await expect(writable.transactionStatus()).resolves.toBe(TransactionStatus.Idle)
      await run(writable, 'START TRANSACTION')
      await expect(writable.transactionStatus()).resolves.toBe(TransactionStatus.Open)
      await run(writable, "INSERT INTO items VALUES (10, 'rolled back')")
      await expect(count()).resolves.toBe('0')

      await run(writable, 'ROLLBACK')

      await expect(writable.transactionStatus()).resolves.toBe(TransactionStatus.Idle)
      await expect(count()).resolves.toBe('0')
    })

    it('should commit what the transaction did', async () => {
      await run(writable, 'BEGIN')
      await run(writable, "INSERT INTO items VALUES (11, 'committed')")

      await run(writable, 'COMMIT')

      await expect(count()).resolves.toBe('1')
      await run(writable, 'DELETE FROM items WHERE id = 11')
    })

    it('should see a failed transaction, which only a rollback ends', async () => {
      await run(writable, 'BEGIN')
      await expect(run(writable, 'SELECT 1 / 0')).rejects.toThrow('division by zero')
      await expect(writable.transactionStatus()).resolves.toBe(TransactionStatus.Failed)
      await expect(run(writable, 'SELECT 1')).rejects.toThrow('current transaction is aborted')

      await run(writable, 'ROLLBACK')

      await expect(writable.transactionStatus()).resolves.toBe(TransactionStatus.Idle)
    })

    it('should roll DDL back with the transaction', async () => {
      await run(writable, 'BEGIN')
      await run(writable, 'CREATE TABLE ddl_in_transaction (id int)')
      await expect(writable.transactionStatus()).resolves.toBe(TransactionStatus.Open)

      await run(writable, 'ROLLBACK')

      await expect(run(observer, 'SELECT * FROM ddl_in_transaction')).rejects.toThrow(
        'does not exist',
      )
    })
  })

  describe('the automatic limit', () => {
    const SETTINGS = { autoLimit: 5, maxRows: 1000, rules: postgresEngine.dialect.lexical }

    async function limited(sql: string): Promise<readonly [number, boolean]> {
      const plan = planLimit(sql, classifyStatement(sql, postgresEngine.dialect), SETTINGS)
      const result = await run(writable, plan.sql, plan.maxRows)
      return [result.rows.length, result.isTruncated]
    }

    it.each([
      'SELECT n FROM generate_series(1, 100000) AS n ORDER BY n DESC',
      'SELECT a, b FROM generate_series(1, 10) a, generate_series(1, 10) b -- every pair',
      '(SELECT n FROM generate_series(1, 10) AS n) ORDER BY n',
      'WITH d AS (SELECT n FROM generate_series(1, 10) AS n) SELECT n FROM d',
      'SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6',
      'SELECT n FROM generate_series(1, 10) AS n OFFSET 2',
      'SELECT n FROM (SELECT n FROM generate_series(1, 10) AS n LIMIT 9) AS d',
      'TABLE pg_catalog.pg_type',
    ])('should keep 5 rows of %s and say more were left', async (sql) => {
      await expect(limited(sql)).resolves.toStrictEqual([5, true])
    })

    it('should leave a query with a limit of its own, and one with fewer rows', async () => {
      await expect(
        limited('(SELECT n FROM generate_series(1, 10) AS n LIMIT 7)'),
      ).resolves.toStrictEqual([7, false])
      await expect(
        limited('SELECT n FROM generate_series(1, 10) AS n FETCH FIRST 8 ROWS ONLY'),
      ).resolves.toStrictEqual([8, false])
      await expect(limited('SELECT 1 UNION SELECT 2')).resolves.toStrictEqual([2, false])
    })
  })
})
