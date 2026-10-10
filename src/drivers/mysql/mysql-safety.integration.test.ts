import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectRequest, MYSQL, waitUntilReady } from '../../../test/integration/servers.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { QueryResult } from '../../core/engine/query.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { planLimit } from '../../core/safety/auto-limit.ts'
import { classifyStatement } from '../../core/safety/classify.ts'
import { isHarmless } from '../../core/safety/statement-class.ts'
import { mysqlEngine } from './mysql-engine.ts'

const DIGITS =
  '(SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)'
const READ_ONLY_ERROR = /READ ONLY transaction/

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

// COUNT(*) is a BIGINT, kept as the exact text the server sent.
async function count(): Promise<unknown> {
  const result = await run(observer, 'SELECT COUNT(*) AS n FROM it_safety')
  return result.rows[0]?.[0]
}

describe('mysqlEngine safety layers, against a real MySQL server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      writable = await mysqlEngine.connect(connectRequest(MYSQL))
    })
    readOnly = await mysqlEngine.connect(connectRequest(MYSQL, { isReadOnly: true }))
    observer = await mysqlEngine.connect(connectRequest(MYSQL))
    await run(writable, 'DROP TABLE IF EXISTS it_safety_new')
    await run(writable, 'DROP TABLE IF EXISTS it_safety')
    await run(writable, 'CREATE TABLE it_safety (id INT PRIMARY KEY, note TEXT)')
  })

  afterAll(async () => {
    await Promise.all([writable.close(), readOnly.close(), observer.close()])
  })

  describe('a read-only session, with the statement checks bypassed', () => {
    it.each([
      'INSERT INTO it_safety VALUES (1, NULL)',
      'UPDATE it_safety SET note = NULL',
      'DELETE FROM it_safety',
      'REPLACE INTO it_safety VALUES (1, NULL)',
      'CREATE TABLE it_safety_new (id INT)',
      'DROP TABLE it_safety',
      'TRUNCATE TABLE it_safety',
      'ALTER TABLE it_safety ADD COLUMN extra INT',
    ])('should refuse %s on the server, as the statement checks do', async (sql) => {
      expect(isHarmless(classifyStatement(sql, mysqlEngine.dialect))).toBe(false)

      await expect(run(readOnly, sql)).rejects.toThrow(READ_ONLY_ERROR)
    })

    it('should refuse writes inside a transaction it opens too', async () => {
      await run(readOnly, 'START TRANSACTION')
      await expect(run(readOnly, 'INSERT INTO it_safety VALUES (2, NULL)')).rejects.toThrow(
        READ_ONLY_ERROR,
      )
      await run(readOnly, 'ROLLBACK')

      await expect(count()).resolves.toBe('0')
    })

    it('should still read', async () => {
      await expect(run(readOnly, 'SELECT COUNT(*) FROM it_safety')).resolves.toMatchObject({
        rows: [['0']],
      })
    })
  })

  describe('transactions', () => {
    it('should report the transaction and roll it back', async () => {
      await expect(writable.transactionStatus()).resolves.toBe(TransactionStatus.Idle)
      await run(writable, 'START TRANSACTION')
      await expect(writable.transactionStatus()).resolves.toBe(TransactionStatus.Open)
      await run(writable, "INSERT INTO it_safety VALUES (10, 'rolled back')")
      await expect(count()).resolves.toBe('0')

      await run(writable, 'ROLLBACK')

      await expect(writable.transactionStatus()).resolves.toBe(TransactionStatus.Idle)
      await expect(count()).resolves.toBe('0')
    })

    it('should commit what the transaction did', async () => {
      await run(writable, 'START TRANSACTION')
      await run(writable, "INSERT INTO it_safety VALUES (11, 'committed')")

      await run(writable, 'COMMIT')

      await expect(count()).resolves.toBe('1')
      await run(writable, 'DELETE FROM it_safety WHERE id = 11')
    })

    it('should see that DDL commits the open transaction first', async () => {
      await run(writable, 'START TRANSACTION')
      await run(writable, "INSERT INTO it_safety VALUES (12, 'before DDL')")

      await run(writable, 'CREATE TABLE it_safety_new (id INT)')

      await expect(writable.transactionStatus()).resolves.toBe(TransactionStatus.Idle)
      await expect(count()).resolves.toBe('1')
      await run(writable, 'DROP TABLE it_safety_new')
      await run(writable, 'DELETE FROM it_safety WHERE id = 12')
    })
  })

  describe('the automatic limit', () => {
    const SETTINGS = { autoLimit: 5, maxRows: 1000, rules: mysqlEngine.dialect.lexical }

    async function limited(sql: string): Promise<readonly [number, boolean]> {
      const plan = planLimit(sql, classifyStatement(sql, mysqlEngine.dialect), SETTINGS)
      const result = await run(writable, plan.sql, plan.maxRows)
      return [result.rows.length, result.isTruncated]
    }

    it.each([
      `SELECT n FROM ${DIGITS} d ORDER BY n`,
      `SELECT a.n FROM ${DIGITS} a CROSS JOIN ${DIGITS} b -- every pair`,
      `(SELECT n FROM ${DIGITS} d) ORDER BY n DESC`,
      `WITH d AS ${DIGITS} SELECT n FROM d`,
      'SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6',
      `SELECT n FROM (SELECT n FROM ${DIGITS} e LIMIT 9) d`,
    ])('should keep 5 rows of %s and say more were left', async (sql) => {
      await expect(limited(sql)).resolves.toStrictEqual([5, true])
    })

    it('should leave a query with a limit of its own, and one with fewer rows', async () => {
      await expect(limited(`(SELECT n FROM ${DIGITS} d LIMIT 7)`)).resolves.toStrictEqual([
        7,
        false,
      ])
      await expect(limited('SELECT 1 UNION SELECT 2')).resolves.toStrictEqual([2, false])
    })
  })
})
