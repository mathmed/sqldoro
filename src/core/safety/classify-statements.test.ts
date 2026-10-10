import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { classifyStatement } from './classify.ts'
import { StatementCategory } from './statement-class.ts'

const { Read, Write, Ddl, Transaction, Session, Unknown } = StatementCategory
const DIALECTS = [
  ['MySQL', MYSQL_DIALECT],
  ['PostgreSQL', POSTGRES_DIALECT],
] as const

// Statements whose first word is enough, the same in both dialects.
const BY_FIRST_WORD: readonly (readonly [string, StatementCategory])[] = [
  ['ALTER TABLE t ADD c int', Ddl],
  ['ANALYZE t', Session],
  ["BINLOG 'abc'", Session],
  ['CACHE INDEX t IN hot', Session],
  ['CALL refresh_totals()', Write],
  ['CHANGE REPLICATION SOURCE TO SOURCE_HOST = 1', Session],
  ['CHECK TABLE t', Session],
  ['CHECKPOINT', Session],
  ['CHECKSUM TABLE t', Read],
  ["CLONE LOCAL DATA DIRECTORY = '/tmp/x'", Session],
  ['CLOSE c', Session],
  ['CLUSTER t USING t_pkey', Session],
  ["COMMENT ON TABLE t IS 'x'", Ddl],
  ['CREATE TABLE t (id int)', Ddl],
  ['DEALLOCATE s', Session],
  ['DECLARE c CURSOR FOR SELECT 1', Session],
  ['DELETE FROM t WHERE id = 1', Write],
  ['DISCARD ALL', Session],
  ["DO 'x'", Write],
  ['DROP TABLE t', Ddl],
  ['FETCH NEXT FROM c', Session],
  ['FLUSH PRIVILEGES', Session],
  ['GET DIAGNOSTICS @n = NUMBER', Session],
  ['GRANT SELECT ON t TO u', Ddl],
  ['HANDLER t OPEN', Session],
  ['HELP contents', Read],
  ['IMPORT FOREIGN SCHEMA s FROM SERVER x INTO y', Ddl],
  ['INSERT INTO t VALUES (1)', Write],
  ["INSTALL PLUGIN p SONAME 'p.so'", Session],
  ['KILL 42', Session],
  ['LISTEN channel', Session],
  ['LOCK TABLES t WRITE', Session],
  ['MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET a = s.a', Write],
  ['MOVE NEXT IN c', Session],
  ["NOTIFY channel, 'x'", Session],
  ['OPTIMIZE TABLE t', Session],
  ["PREPARE s FROM 'SELECT 1'", Session],
  ["PURGE BINARY LOGS TO 'b.010'", Session],
  ['REASSIGN OWNED BY a TO b', Ddl],
  ['REFRESH MATERIALIZED VIEW v', Ddl],
  ['REINDEX TABLE t', Session],
  ['RENAME TABLE a TO b', Ddl],
  ['REPAIR TABLE t', Session],
  ['REPLACE INTO t VALUES (1)', Write],
  ['RESET ALL', Session],
  ['RESIGNAL', Session],
  ['RESTART', Session],
  ['REVOKE SELECT ON t FROM u', Ddl],
  ["SECURITY LABEL ON TABLE t IS 'x'", Ddl],
  ['SET search_path TO shop', Session],
  ['SHOW TABLES', Read],
  ['SHUTDOWN', Session],
  ["SIGNAL SQLSTATE '45000'", Session],
  ['STOP REPLICA', Session],
  ['TRUNCATE t', Ddl],
  ['UNINSTALL PLUGIN p', Session],
  ['UNLISTEN *', Session],
  ['UNLOCK TABLES', Session],
  ['UPDATE t SET a = 1 WHERE id = 1', Write],
  ['UPSERT INTO t VALUES (1)', Write],
  ['USE shop', Session],
  ['VACUUM FULL t', Session],
  ["XA START 'x'", Session],
]

const TRANSACTION_CONTROL: readonly (readonly [string, StatementCategory])[] = [
  ['BEGIN', Transaction],
  ['begin work', Transaction],
  ['BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE', Transaction],
  ['BEGIN READ ONLY', Transaction],
  ['START TRANSACTION', Transaction],
  ['START TRANSACTION READ ONLY', Transaction],
  ['START TRANSACTION WITH CONSISTENT SNAPSHOT', Transaction],
  ['COMMIT', Transaction],
  ['COMMIT AND CHAIN', Transaction],
  ['ROLLBACK', Transaction],
  ['ROLLBACK TO SAVEPOINT a', Transaction],
  ['SAVEPOINT a', Transaction],
  ['RELEASE SAVEPOINT a', Transaction],
  ['END', Transaction],
  ['ABORT', Transaction],
  ['START REPLICA', Session],
  ["COMMIT PREPARED 'x'", Session],
  ["ROLLBACK PREPARED 'x'", Session],
  ["PREPARE TRANSACTION 'x'", Session],
]

describe.each(DIALECTS)('classifyStatement in %s', (...[, dialect]) => {
  it.each(BY_FIRST_WORD)('should classify %s by its first word as %s', (sql, category) => {
    const sut = classifyStatement(sql, dialect)

    expect(sut.category).toBe(category)
    expect(sut.verb).toBe(sql.split(' ')[0]?.toUpperCase())
  })

  it.each(TRANSACTION_CONTROL)('should classify %s as %s', (sql, category) => {
    expect(classifyStatement(sql, dialect).category).toBe(category)
  })

  it.each([
    'START TRANSACTION READ WRITE',
    'BEGIN READ WRITE',
    'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED, READ WRITE',
  ])('should see that %s lets the transaction write', (sql) => {
    expect(classifyStatement(sql, dialect)).toMatchObject({
      category: Session,
      detail: 'it lets the transaction write',
    })
  })

  it.each([
    ["LOAD DATA INFILE 'x.csv' INTO TABLE t", Write],
    ["LOAD XML INFILE 'x.xml' INTO TABLE t", Write],
    ['LOAD INDEX INTO CACHE t', Session],
    ["LOAD 'auto_explain'", Session],
  ] as const)('should classify %s as %s', (sql, category) => {
    expect(classifyStatement(sql, dialect)).toMatchObject({ category, verb: 'LOAD' })
  })

  it.each([
    ['COPY t FROM STDIN', Write],
    ["COPY t TO '/tmp/t.csv'", Write],
    ["COPY t TO PROGRAM 'gzip > /tmp/t.gz'", Write],
    ['COPY t TO STDOUT', Read],
    ['COPY (SELECT * FROM t) TO STDOUT', Read],
  ] as const)('should classify %s as %s', (sql, category) => {
    expect(classifyStatement(sql, dialect)).toMatchObject({ category, verb: 'COPY' })
  })

  it('should see the write in a COPY of what a statement returns', () => {
    expect(
      classifyStatement('COPY (DELETE FROM t WHERE id = 1 RETURNING *) TO STDOUT', dialect),
    ).toMatchObject({ category: Write, verb: 'DELETE' })
  })

  it.each([
    ['EXECUTE s', 'EXECUTE'],
    ['FROBNICATE t', 'FROBNICATE'],
    ['42', ''],
    ['( 1 )', ''],
  ])('should not know what %s does', (sql, verb) => {
    expect(classifyStatement(sql, dialect)).toStrictEqual({
      category: Unknown,
      verb,
      detail: 'sqldoro cannot tell what it does',
      unfiltered: [],
    })
  })

  it.each([
    ["SELECT 'unclosed", 'a string, quoted name or comment in it is not closed'],
    ['SELECT 1 /* DELETE FROM t', 'a string, quoted name or comment in it is not closed'],
    ['SELECT (1', 'its parentheses do not match'],
    ['SELECT 1)', 'its parentheses do not match'],
    ['SELECT )1(', 'its parentheses do not match'],
    ['', 'there is no statement in it'],
    [' -- only a comment', 'there is no statement in it'],
  ])('should fail closed on %j: %s', (sql, detail) => {
    expect(classifyStatement(sql, dialect)).toStrictEqual({
      category: Unknown,
      verb: '',
      detail,
      unfiltered: [],
    })
  })
})
