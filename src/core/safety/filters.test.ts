import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { classifyStatement } from './classify.ts'

const DIALECTS = [
  ['MySQL', MYSQL_DIALECT],
  ['PostgreSQL', POSTGRES_DIALECT],
] as const

function unfiltered(sql: string, dialect = POSTGRES_DIALECT): unknown {
  return classifyStatement(sql, dialect).unfiltered
}

describe.each(DIALECTS)(
  'the UPDATE and DELETE statements that reach every row, in %s',
  (...[, dialect]) => {
    it.each([
      ['UPDATE t SET a = 1', 'UPDATE', 't'],
      ['DELETE FROM t', 'DELETE', 't'],
      ['delete from shop.orders', 'DELETE', 'orders'],
      ['UPDATE ONLY t SET a = 1', 'UPDATE', 't'],
      ['DELETE FROM ONLY t', 'DELETE', 't'],
      ['UPDATE LOW_PRIORITY IGNORE t SET a = 1', 'UPDATE', 't'],
      ['DELETE LOW_PRIORITY QUICK IGNORE FROM t', 'DELETE', 't'],
      ['DELETE t1 FROM t1 JOIN t2 ON t1.id = t2.id', 'DELETE', 't1'],
      ['UPDATE t JOIN u ON t.id = u.id SET t.a = u.a', 'UPDATE', 't'],
      ['UPDATE t SET a = (SELECT b FROM u WHERE u.id = 1)', 'UPDATE', 't'],
      ['UPDATE t SET a = 1 ORDER BY id LIMIT 10', 'UPDATE', 't'],
      ['DELETE FROM s.', 'DELETE', 's'],
      ['UPDATE (SELECT 1) SET a = 1', 'UPDATE', ''],
      ['WITH x AS (SELECT * FROM u WHERE id = 1) DELETE FROM t', 'DELETE', 't'],
      ['WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d WHERE id = 1', 'DELETE', 't'],
      [
        'WITH a AS (SELECT * FROM x WHERE true), b AS (DELETE FROM t RETURNING *) SELECT * FROM b',
        'DELETE',
        't',
      ],
      ['EXPLAIN ANALYZE UPDATE t SET a = 1', 'UPDATE', 't'],
      ['SELECT 1; DELETE FROM t', 'DELETE', 't'],
    ])('should see that %s reaches every row', (sql, verb, table) => {
      expect(unfiltered(sql, dialect)).toStrictEqual([{ verb, table, hasAlwaysTrueWhere: false }])
    })

    it.each([
      'UPDATE t SET a = 1 WHERE id = 1',
      'DELETE FROM t WHERE id = ?',
      'DELETE FROM t WHERE id = $1',
      'DELETE FROM t WHERE id = 1 AND 1 = 1',
      'DELETE FROM t WHERE NOT active',
      'DELETE FROM t WHERE x BETWEEN 1 AND 2',
      'DELETE FROM t WHERE 1 = 1 AND x BETWEEN 1 AND 2',
      'DELETE FROM t WHERE id IN (SELECT id FROM u)',
      'DELETE FROM t WHERE lower(name) = 1',
      'DELETE FROM t WHERE a = b',
      'DELETE FROM t WHERE id = idx',
      'DELETE FROM t WHERE id = 1 ORDER BY id LIMIT 1',
      'DELETE FROM t WHERE 1 = 1 AND x = 1 OR y = 2',
      'DELETE FROM t WHERE (id = 1) OR (id = 2)',
      "DELETE FROM t WHERE name = 'x' AND NOT (a = 1 OR TRUE)",
      'DELETE FROM t WHERE (1) = x',
      'DELETE FROM t WHERE EXISTS (SELECT 1 FROM u WHERE u.id = t.id)',
      'UPDATE t SET a = 1 WHERE CURRENT OF c',
      'WITH d AS (DELETE FROM t WHERE id = 1 RETURNING *) SELECT * FROM d',
      'INSERT INTO t VALUES (1) ON CONFLICT (id) DO UPDATE SET a = 1',
      'INSERT INTO t VALUES (1) ON DUPLICATE KEY UPDATE a = 1',
      'MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET a = 1',
      'SELECT * FROM t FOR UPDATE',
      'CREATE TABLE t (a int REFERENCES u ON DELETE CASCADE ON UPDATE CASCADE)',
      'EXPLAIN UPDATE t SET a = 1',
      'EXPLAIN WITH d AS (DELETE FROM t) SELECT 1',
      "SELECT 'DELETE FROM t'",
    ])('should see that %s does not reach every row', (sql) => {
      expect(unfiltered(sql, dialect)).toStrictEqual([])
    })
  },
)

describe('the WHERE conditions that are always true', () => {
  it.each([
    'WHERE 1 = 1',
    'WHERE true',
    'WHERE TRUE',
    'WHERE 1',
    "WHERE 'a' = 'a'",
    'WHERE id = 5 OR 1 = 1',
    'WHERE 1 = 1 OR id = 5',
    'WHERE id = id',
    'WHERE t.id = T.ID',
    'WHERE (id = 1 OR 1 = 1)',
    'WHERE (id = id)',
    'WHERE ((1 = 1))',
    'WHERE NOT FALSE',
    'WHERE NULL IS NULL',
    'WHERE TRUE IS NOT UNKNOWN',
    'WHERE 1 BETWEEN 0 AND 2',
    'WHERE 1 IN (1, 2)',
    "WHERE 'a' LIKE 'a' ESCAPE '!'",
    "WHERE 'a' ILIKE 'A'",
    "WHERE 'a' SIMILAR TO 'a'",
    'WHERE 1 IS DISTINCT FROM 2',
    'WHERE 1 = ANY (SELECT 1)',
    'WHERE 1 = ALL (SELECT 1)',
    'WHERE 1 = SOME (SELECT 1)',
    'WHERE CASE WHEN TRUE THEN TRUE ELSE FALSE END',
    'WHERE EXISTS (SELECT 1)',
    'WHERE EXISTS (SELECT 1 WHERE 1 = 1 AND 2 = 2 OR 3 = 3)',
    'WHERE now() > 0',
    "WHERE CURRENT_DATE > '2000-01-01'",
    "WHERE CURRENT_TIMESTAMP > '2000-01-01'",
    'WHERE ? = ?',
    'WHERE',
    'WHERE 1 = 1 RETURNING *',
    'WHERE true ORDER BY id',
    'WHERE true LIMIT 5',
  ])('should see that DELETE FROM t %s deletes every row', (where) => {
    expect(unfiltered(`DELETE FROM t ${where}`)).toStrictEqual([
      { verb: 'DELETE', table: 't', hasAlwaysTrueWhere: true },
    ])
  })

  it('should read each WITH query up to its own end', () => {
    expect(
      unfiltered('WITH a AS (DELETE FROM t WHERE true), b AS (SELECT 1 ORDER BY 1) SELECT 1'),
    ).toStrictEqual([{ verb: 'DELETE', table: 't', hasAlwaysTrueWhere: true }])
  })

  it('should see quoted columns in a condition', () => {
    expect(unfiltered('DELETE FROM t WHERE "id" = 1')).toStrictEqual([])
    expect(unfiltered('DELETE FROM t WHERE `id` = 1', MYSQL_DIALECT)).toStrictEqual([])
  })

  it('should read the code of MySQL executable comments, after their version', () => {
    expect(unfiltered('/*! DELETE FROM t2 */', MYSQL_DIALECT)).toStrictEqual([
      { verb: 'DELETE', table: 't2', hasAlwaysTrueWhere: false },
    ])
    expect(unfiltered('/*!80013 DELETE FROM t3 */', MYSQL_DIALECT)).toStrictEqual([
      { verb: 'DELETE', table: 't3', hasAlwaysTrueWhere: false },
    ])
  })

  it('should name quoted tables without their quotes', () => {
    expect(unfiltered('DELETE FROM "Order Lines"')).toStrictEqual([
      { verb: 'DELETE', table: 'Order Lines', hasAlwaysTrueWhere: false },
    ])
    expect(unfiltered('UPDATE `my db`.`my table` SET a = 1', MYSQL_DIALECT)).toStrictEqual([
      { verb: 'UPDATE', table: 'my table', hasAlwaysTrueWhere: false },
    ])
  })

  it('should list every statement of a text that reaches every row', () => {
    expect(
      unfiltered('DELETE FROM a; DELETE FROM b WHERE id = 1; UPDATE c SET x = 1 WHERE 1 = 1'),
    ).toStrictEqual([
      { verb: 'DELETE', table: 'a', hasAlwaysTrueWhere: false },
      { verb: 'UPDATE', table: 'c', hasAlwaysTrueWhere: true },
    ])
  })
})
