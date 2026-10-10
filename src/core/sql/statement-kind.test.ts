import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import {
  changesSchema,
  isReadOnlyQuery,
  leadingKeyword,
  significantTokens,
} from './statement-kind.ts'

describe('significantTokens', () => {
  it('should leave out whitespace and comments', () => {
    expect(
      significantTokens('/* a */ SELECT -- b\n 1', POSTGRES_LEXICAL).map((token) => token.text),
    ).toStrictEqual(['SELECT', '1'])
  })
})

describe('leadingKeyword', () => {
  it('should return the first word in upper case, after comments', () => {
    expect(leadingKeyword('-- note\n  select 1', POSTGRES_LEXICAL)).toBe('SELECT')
  })

  it('should return an empty string when the statement does not start with a word', () => {
    expect(leadingKeyword('(SELECT 1)', POSTGRES_LEXICAL)).toBe('')
    expect(leadingKeyword('', POSTGRES_LEXICAL)).toBe('')
  })
})

describe('changesSchema', () => {
  it.each([
    'CREATE TABLE t (a int)',
    'alter table t add b int',
    'DROP VIEW v',
    'RENAME TABLE a TO b',
  ])('should see that %s changes the schema', (sql) => {
    expect(changesSchema(sql, MYSQL_LEXICAL)).toBe(true)
  })

  it.each(['SELECT 1', 'INSERT INTO t VALUES (1)', 'TRUNCATE t', "SELECT 'CREATE'"])(
    'should see that %s does not change the schema',
    (sql) => {
      expect(changesSchema(sql, MYSQL_LEXICAL)).toBe(false)
    },
  )
})

describe('isReadOnlyQuery', () => {
  it.each([
    'SELECT * FROM t',
    'with x as (select 1) select * from x',
    'TABLE t',
    'VALUES (1), (2)',
    "SELECT 'DELETE; INSERT' AS words -- UPDATE",
    'SELECT "update" FROM t',
  ])('should accept %s', (sql) => {
    expect(isReadOnlyQuery(sql, POSTGRES_LEXICAL)).toBe(true)
  })

  it.each([
    'SHOW TABLES',
    'EXPLAIN SELECT 1',
    'INSERT INTO t SELECT 1',
    'UPDATE t SET a = 1',
    'DELETE FROM t',
    'WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d',
    'SELECT * INTO copy FROM t',
    'SELECT * FROM t FOR UPDATE',
    "SELECT nextval('s')",
    'SELECT pg_sleep(1)',
    'SELECT 1; DELETE FROM t',
    '(SELECT 1)',
    '',
  ])('should refuse %s', (sql) => {
    expect(isReadOnlyQuery(sql, POSTGRES_LEXICAL)).toBe(false)
  })

  it('should refuse MySQL queries with executable comments or that write to a file', () => {
    expect(isReadOnlyQuery('SELECT /*!50000 SLEEP(1) */ 1', MYSQL_LEXICAL)).toBe(false)
    expect(isReadOnlyQuery("SELECT * FROM t INTO OUTFILE '/tmp/x'", MYSQL_LEXICAL)).toBe(false)
    expect(isReadOnlyQuery('SELECT /*+ BKA(t) */ 1 FROM t', MYSQL_LEXICAL)).toBe(true)
  })
})
