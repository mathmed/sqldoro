import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { classifyScript, classifyStatement } from './classify.ts'
import { StatementCategory } from './statement-class.ts'

const { Read, Write, Ddl, Unknown } = StatementCategory
const DIALECTS = [
  ['MySQL', MYSQL_DIALECT],
  ['PostgreSQL', POSTGRES_DIALECT],
] as const

function summary(sql: string, dialect: typeof MYSQL_DIALECT): readonly [string, string] {
  const { category, verb } = classifyStatement(sql, dialect)
  return [category, verb]
}

describe.each(DIALECTS)('classifyStatement of queries in %s', (...[, dialect]) => {
  it.each([
    ['SELECT 1', 'SELECT'],
    ['select * from orders where id = 1', 'SELECT'],
    ['  -- why\n  SELECT 1 /* trailing */', 'SELECT'],
    ['(SELECT 1)', 'SELECT'],
    ['((SELECT 1)) UNION (SELECT 2)', 'SELECT'],
    ["SELECT 'DELETE FROM t; DROP TABLE t'", 'SELECT'],
    ["SELECT 'it''s', 'UPDATE t SET a = 1'", 'SELECT'],
    ['SELECT a FROM t ORDER BY a DESC', 'SELECT'],
    ["SELECT replace(name, 'a', 'b') FROM t", 'SELECT'],
    ["SELECT (replace('a', 'b', 'c')), (insert('abc', 1, 1, 'x'))", 'SELECT'],
    ['SELECT update_count, deleted FROM stats', 'SELECT'],
    ['SELECT * FROM t WHERE x IN (SELECT y FROM u)', 'SELECT'],
    ["SELECT substring('abc' FROM 1 FOR 2)", 'SELECT'],
    ['SELECT * FROM t WHERE lock IS NULL', 'SELECT'],
    ['SELECT pg_sleep(1), sleep(1)', 'SELECT'],
    ['SELECT nextval FROM t', 'SELECT'],
    ["SELECT 'nextval(1)', 'GET_LOCK(1)'", 'SELECT'],
    ["SELECT * FROM t WHERE x = 'a'';DELETE FROM t;--'", 'SELECT'],
    ['SELECT 1 -- ; DROP TABLE t', 'SELECT'],
    ['SELECT 1 /* ; DELETE FROM t */', 'SELECT'],
    ['SELECT `update` FROM t', 'SELECT'],
    ['  \n\t(\n SELECT 1 )', 'SELECT'],
    ['WITH x AS (SELECT 1) SELECT * FROM x', 'WITH'],
    [
      'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 5) SELECT i FROM n',
      'WITH',
    ],
    ['WITH x AS (SELECT 1) TABLE x', 'WITH'],
    ['WITH x AS (SELECT 1) VALUES (1)', 'WITH'],
    ['WITH x AS (SELECT 1)', 'WITH'],
    ['TABLE orders', 'TABLE'],
    ['VALUES (1), (2)', 'VALUES'],
  ])('should see that %s only reads', (sql, verb) => {
    expect(summary(sql, dialect)).toStrictEqual([Read, verb])
  })

  it.each([
    ['WITH d AS (DELETE FROM t WHERE id = 1 RETURNING *) SELECT * FROM d', 'DELETE'],
    ['WITH u AS (UPDATE t SET a = 1 WHERE id = 1 RETURNING *) SELECT * FROM u', 'UPDATE'],
    ['WITH i AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM i', 'INSERT'],
    ['WITH m AS (MERGE INTO t USING s ON true WHEN MATCHED THEN DELETE) SELECT 1', 'MERGE'],
    ['WITH x AS (SELECT 1) DELETE FROM t WHERE id IN (SELECT * FROM x)', 'DELETE'],
    ['WITH x AS (SELECT 1) UPDATE t SET a = 1 WHERE id = 1', 'UPDATE'],
    ['WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x', 'INSERT'],
    ['WITH x AS (SELECT 1) MERGE INTO t USING x ON true WHEN MATCHED THEN DELETE', 'MERGE'],
    ['WITH a AS (WITH b AS (SELECT 1) DELETE FROM t WHERE id = 1) SELECT 1', 'DELETE'],
    ['WITH d AS (DELETE FROM t WHERE id = 1)', 'DELETE'],
    ['WITH DELETE FROM t WHERE id = 1', 'DELETE'],
    ['SELECT * FROM (WITH d AS (DELETE FROM t WHERE id = 1) SELECT 1) x', 'DELETE'],
  ])('should see the write in %s', (sql, verb) => {
    expect(summary(sql, dialect)).toStrictEqual([Write, verb])
  })

  it.each([
    ['SELECT * INTO copy FROM t', 'it writes what it reads, with INTO'],
    ["SELECT * FROM t INTO OUTFILE '/tmp/t'", 'it writes what it reads, with INTO'],
    ['SELECT id INTO @id FROM t', 'it writes what it reads, with INTO'],
    ['SELECT * FROM t FOR UPDATE', 'it locks the rows it reads'],
    ['SELECT * FROM t FOR NO KEY UPDATE', 'it locks the rows it reads'],
    ['SELECT * FROM t FOR SHARE', 'it locks the rows it reads'],
    ['SELECT * FROM t FOR KEY SHARE', 'it locks the rows it reads'],
    ['SELECT * FROM t LOCK IN SHARE MODE', 'it locks the rows it reads'],
    ['(SELECT * FROM t FOR UPDATE)', 'it locks the rows it reads'],
  ])('should see that %s does more than read: %s', (sql, detail) => {
    expect(classifyStatement(sql, dialect)).toMatchObject({
      category: Write,
      verb: 'SELECT',
      detail,
    })
  })

  it.each([
    ['EXPLAIN SELECT * FROM t', 'EXPLAIN'],
    ['EXPLAIN DELETE FROM t', 'EXPLAIN'],
    ['EXPLAIN UPDATE t SET a = 1', 'EXPLAIN'],
    ['EXPLAIN SELECT 1 AS analyze', 'EXPLAIN'],
    ['EXPLAIN FORMAT=TREE INSERT INTO t VALUES (1)', 'EXPLAIN'],
    ['EXPLAIN (FORMAT JSON) MERGE INTO t USING s ON true WHEN MATCHED THEN DELETE', 'EXPLAIN'],
    ['EXPLAIN FOR CONNECTION 42', 'EXPLAIN'],
    ['DESCRIBE orders', 'DESCRIBE'],
    ['DESC orders', 'DESC'],
    ['EXPLAIN ANALYZE SELECT 1', 'EXPLAIN ANALYZE SELECT'],
    ['EXPLAIN (ANALYZE, BUFFERS) TABLE t', 'EXPLAIN ANALYZE TABLE'],
    ['EXPLAIN ANALYSE VALUES (1)', 'EXPLAIN ANALYZE VALUES'],
    ['EXPLAIN ANALYZE WITH x AS (SELECT 1) SELECT * FROM x', 'EXPLAIN ANALYZE WITH'],
    ['DESCRIBE ANALYZE SELECT 1', 'DESCRIBE ANALYZE SELECT'],
  ])('should see that %s only reads', (sql, verb) => {
    expect(classifyStatement(sql, dialect)).toStrictEqual({
      category: Read,
      verb,
      detail: '',
      unfiltered: [],
    })
  })

  it.each([
    ['EXPLAIN ANALYZE DELETE FROM t WHERE id = 1', Write, 'EXPLAIN ANALYZE DELETE'],
    ['EXPLAIN ANALYZE UPDATE t SET a = 1 WHERE id = 1', Write, 'EXPLAIN ANALYZE UPDATE'],
    ['EXPLAIN (ANALYZE) INSERT INTO t VALUES (1)', Write, 'EXPLAIN ANALYZE INSERT'],
    ['EXPLAIN ANALYZE REPLACE INTO t VALUES (1)', Write, 'EXPLAIN ANALYZE REPLACE'],
    [
      'EXPLAIN ANALYZE MERGE INTO t USING s ON true WHEN MATCHED THEN DELETE',
      Write,
      'EXPLAIN ANALYZE MERGE',
    ],
    ['EXPLAIN ANALYZE CREATE TABLE t AS SELECT 1', Ddl, 'EXPLAIN ANALYZE CREATE'],
    [
      'EXPLAIN ANALYZE DECLARE c CURSOR FOR SELECT 1',
      StatementCategory.Session,
      'EXPLAIN ANALYZE DECLARE',
    ],
    ['EXPLAIN ANALYZE EXECUTE s', Unknown, 'EXPLAIN ANALYZE EXECUTE'],
    ['EXPLAIN ANALYZE', Unknown, 'EXPLAIN ANALYZE'],
    ['EXPLAIN ANALYZE (SELECT 1)', Unknown, 'EXPLAIN ANALYZE'],
  ])('should see that %s runs its statement', (sql, category, verb) => {
    expect(summary(sql, dialect)).toStrictEqual([category, verb])
  })

  it('should say why it cannot tell what EXPLAIN ANALYZE runs', () => {
    expect(classifyStatement('EXPLAIN ANALYZE', dialect).detail).toBe(
      'sqldoro cannot tell what it runs',
    )
  })
})

describe('classifyStatement of calls with side effects', () => {
  it.each([
    "SELECT nextval('orders_id_seq')",
    "SELECT pg_catalog.setval('s', 1)",
    "SELECT NEXTVAL ('s')",
    'SELECT "nextval"(1)',
    'SELECT * FROM pg_advisory_lock(1)',
    "SELECT set_config('default_transaction_read_only', 'off', false)",
    'SELECT pg_terminate_backend(42) /* bye */',
  ])('should see that %s writes in PostgreSQL', (sql) => {
    expect(classifyStatement(sql, POSTGRES_DIALECT)).toMatchObject({
      category: Write,
      verb: 'SELECT',
      detail: expect.stringMatching(/^it calls \S+$/) as string,
    })
  })

  it('should name the function it calls', () => {
    expect(classifyStatement("SELECT nextval('s')", POSTGRES_DIALECT).detail).toBe(
      'it calls nextval',
    )
    expect(classifyStatement("SELECT get_lock('x', 1)", MYSQL_DIALECT).detail).toBe(
      'it calls get_lock',
    )
  })

  it('should know the functions of each dialect only', () => {
    expect(classifyStatement("SELECT GET_LOCK('x', 1)", POSTGRES_DIALECT).category).toBe(Read)
    expect(classifyStatement("SELECT nextval('s')", MYSQL_DIALECT).category).toBe(Read)
  })
})

describe('classifyStatement of what each dialect hides in text', () => {
  it.each([
    ["SELECT 'it\\'s; DROP TABLE t'", Read, Unknown],
    ['SELECT 1 # ; DROP TABLE t', Read, Ddl],
    ['SELECT 1 --; DROP TABLE t', Ddl, Read],
    ['SELECT 1 /* a /* b */ ; DROP TABLE t */', Ddl, Read],
    ['SELECT $$; DROP TABLE t; $$', Unknown, Read],
    ['SELECT $tag$ DELETE FROM t $tag$', Read, Read],
    ["SELECT E'\\'; DROP TABLE t'", Read, Read],
    ["SELECT 'a\\'; DROP TABLE t; SELECT '", Read, Unknown],
    ['SELECT "a;b" FROM t', Read, Read],
    ['SELECT `a;b` FROM t', Read, Unknown],
    ["SELECT 1 /*!50000 , GET_LOCK('x', 1) */", Write, Read],
    ['/*!50000 DELETE FROM t WHERE id = 1 */', Write, Unknown],
    ['SELECT /*!40001 SQL_NO_CACHE */ 1', Read, Read],
    ["SELECT 1 /*! INTO OUTFILE '/tmp/x' */", Write, Read],
    ['SELECT 1 /*!50000 /*!50000 DROP TABLE t */', Unknown, Unknown],
    ['SELECT 1 /*! DELETE FROM t', Unknown, Unknown],
  ] as const)('should classify %s as %s in MySQL and %s in PostgreSQL', (sql, mysql, postgres) => {
    expect(classifyStatement(sql, MYSQL_DIALECT).category).toBe(mysql)
    expect(classifyStatement(sql, POSTGRES_DIALECT).category).toBe(postgres)
  })
})

describe('classifyScript of PostgreSQL bodies', () => {
  it('should keep a DO block whole, semicolons inside its dollar quotes and all', () => {
    expect(
      classifyScript('DO $$ BEGIN DELETE FROM t; DROP TABLE u; END $$;', POSTGRES_DIALECT).map(
        ({ category, verb }) => [category, verb],
      ),
    ).toStrictEqual([[Write, 'DO']])
  })

  it('should not hide a statement behind a semicolon without spaces', () => {
    expect(
      classifyScript('SELECT 1;DELETE FROM t WHERE id = 1', POSTGRES_DIALECT).map(
        ({ verb }) => verb,
      ),
    ).toStrictEqual(['SELECT', 'DELETE'])
  })
})

describe('classifyScript', () => {
  it('should classify each statement of a script, whatever hides a semicolon', () => {
    const sut = classifyScript(
      "SELECT ';' AS semi; DELETE FROM t WHERE id = 1;; -- done\nDROP TABLE t;",
      POSTGRES_DIALECT,
    )

    expect(sut.map(({ category, verb }) => [category, verb])).toStrictEqual([
      [Read, 'SELECT'],
      [Write, 'DELETE'],
      [Ddl, 'DROP'],
    ])
  })

  it('should give one Unknown statement for a script it cannot read', () => {
    expect(classifyScript("SELECT 1; SELECT '", MYSQL_DIALECT)).toHaveLength(1)
    expect(classifyScript('', MYSQL_DIALECT)).toStrictEqual([])
  })

  it('should make a text with several statements as dangerous as its worst', () => {
    expect(classifyStatement('SELECT 1; DELETE FROM t; SELECT 2', MYSQL_DIALECT)).toStrictEqual({
      category: Write,
      verb: 'DELETE',
      detail: '',
      unfiltered: [{ verb: 'DELETE', table: 't', hasAlwaysTrueWhere: false }],
    })
  })
})
