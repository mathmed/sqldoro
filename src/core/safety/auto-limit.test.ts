import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { type LimitSettings, planLimit } from './auto-limit.ts'
import { StatementCategory } from './statement-class.ts'

const SETTINGS: LimitSettings = { autoLimit: 1000, maxRows: 100_000, rules: POSTGRES_LEXICAL }
const SELECT = { category: StatementCategory.Read, verb: 'SELECT' }

function planned(sql: string, settings: Partial<LimitSettings> = {}): ReturnType<typeof planLimit> {
  return planLimit(sql, SELECT, { ...SETTINGS, ...settings })
}

describe('planLimit', () => {
  it.each([
    ['SELECT * FROM t', 'SELECT * FROM t LIMIT 1001'],
    ['select * from t order by id desc', 'select * from t order by id desc LIMIT 1001'],
    ['SELECT 1 -- trailing comment', 'SELECT 1 LIMIT 1001 -- trailing comment'],
    ['SELECT 1 /* note */\n', 'SELECT 1 LIMIT 1001 /* note */\n'],
    ['SELECT a FROM t UNION SELECT b FROM u', 'SELECT a FROM t UNION SELECT b FROM u LIMIT 1001'],
    ['(SELECT 1) UNION (SELECT 2)', '(SELECT 1) UNION (SELECT 2) LIMIT 1001'],
    ['(SELECT 1) ORDER BY 1', '(SELECT 1) ORDER BY 1 LIMIT 1001'],
    ['(SELECT 1)', '(SELECT 1) LIMIT 1001'],
    [
      '(SELECT 1 FROM t) UNION ALL (SELECT 2 FROM u LIMIT 5)',
      '(SELECT 1 FROM t) UNION ALL (SELECT 2 FROM u LIMIT 5) LIMIT 1001',
    ],
    [
      'WITH x AS (SELECT 1 LIMIT 5) SELECT * FROM x',
      'WITH x AS (SELECT 1 LIMIT 5) SELECT * FROM x LIMIT 1001',
    ],
    [
      'SELECT * FROM t WHERE id IN (SELECT id FROM u LIMIT 5)',
      'SELECT * FROM t WHERE id IN (SELECT id FROM u LIMIT 5) LIMIT 1001',
    ],
    ["SELECT 'LIMIT 5'", "SELECT 'LIMIT 5' LIMIT 1001"],
  ])('should give %s an automatic limit: %s', (sql, limited) => {
    expect(planned(sql)).toStrictEqual({ sql: limited, maxRows: 1000, autoLimit: 1000 })
  })

  it('should limit TABLE and WITH queries too', () => {
    expect(planLimit('TABLE t', { ...SELECT, verb: 'TABLE' }, SETTINGS).sql).toBe(
      'TABLE t LIMIT 1001',
    )
    expect(
      planLimit('WITH x AS (SELECT 1) SELECT * FROM x', { ...SELECT, verb: 'WITH' }, SETTINGS).sql,
    ).toBe('WITH x AS (SELECT 1) SELECT * FROM x LIMIT 1001')
  })

  it.each([
    'SELECT * FROM t LIMIT 10',
    'SELECT * FROM t LIMIT 5, 10',
    'SELECT * FROM t FETCH FIRST 3 ROWS ONLY',
    'SELECT TOP 10 * FROM t',
    '(SELECT * FROM t LIMIT 5)',
    '((SELECT * FROM t LIMIT 5))',
  ])('should leave %s with the limit it has', (sql) => {
    expect(planned(sql)).toStrictEqual({ sql, maxRows: 100_000, autoLimit: null })
  })

  it.each([
    'SELECT * FROM t OFFSET 10',
    'SELECT 1; SELECT 2',
    'SELECT /*!40001 SQL_NO_CACHE */ * FROM t',
  ])('should not append to %s, and stop reading at the limit instead', (sql) => {
    expect(planned(sql, { rules: MYSQL_LEXICAL })).toStrictEqual({
      sql,
      maxRows: 1000,
      autoLimit: 1000,
    })
  })

  it.each([
    [{ category: StatementCategory.Read, verb: 'VALUES' }],
    [{ category: StatementCategory.Read, verb: 'SHOW' }],
    [{ category: StatementCategory.Read, verb: 'EXPLAIN' }],
    [{ category: StatementCategory.Write, verb: 'SELECT' }],
    [{ category: StatementCategory.Write, verb: 'UPDATE' }],
  ])('should run %j as written', (statement) => {
    expect(planLimit('SELECT 1', statement, SETTINGS)).toStrictEqual({
      sql: 'SELECT 1',
      maxRows: 100_000,
      autoLimit: null,
    })
  })

  it('should run as written when automatic limits are off', () => {
    expect(planned('SELECT * FROM t', { autoLimit: null })).toStrictEqual({
      sql: 'SELECT * FROM t',
      maxRows: 100_000,
      autoLimit: null,
    })
  })

  it('should never keep more rows than the row limit', () => {
    expect(planned('SELECT * FROM t', { autoLimit: 500_000, maxRows: 2000 })).toStrictEqual({
      sql: 'SELECT * FROM t LIMIT 2001',
      maxRows: 2000,
      autoLimit: 2000,
    })
  })
})
