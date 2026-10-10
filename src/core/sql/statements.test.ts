import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { splitStatements, statementAt, type StatementSpan } from './statements.ts'

function texts(sql: string, rules = POSTGRES_LEXICAL): string[] {
  return splitStatements(sql, rules).map((statement) => statement.text)
}

describe('splitStatements', () => {
  it('should split on semicolons and keep the offsets of each statement', () => {
    const sql = 'SELECT 1;\n  SELECT 2 ;'

    expect(splitStatements(sql, POSTGRES_LEXICAL)).toStrictEqual([
      { text: 'SELECT 1', start: 0, end: 8, terminatorEnd: 9 },
      { text: 'SELECT 2', start: 12, end: 20, terminatorEnd: 22 },
    ])
  })

  it('should end the last statement at the end of the text when it has no semicolon', () => {
    expect(splitStatements('SELECT 1; SELECT 2  ', MYSQL_LEXICAL)).toStrictEqual([
      { text: 'SELECT 1', start: 0, end: 8, terminatorEnd: 9 },
      { text: 'SELECT 2', start: 10, end: 18, terminatorEnd: 20 },
    ])
  })

  it('should leave out empty statements and statements made only of comments', () => {
    expect(texts(';; -- nothing\n; /* a */ ;\n')).toStrictEqual([])
    expect(texts('')).toStrictEqual([])
  })

  it('should keep comments inside a statement and drop the ones around it', () => {
    expect(texts('-- first\nSELECT /* a; */ 1 -- end\n; /* x */ SELECT 2')).toStrictEqual([
      'SELECT /* a; */ 1',
      'SELECT 2',
    ])
  })

  it('should not split on semicolons in strings and quoted identifiers', () => {
    expect(texts(`SELECT 'a;b', "c;d"; SELECT 2`)).toStrictEqual([
      `SELECT 'a;b', "c;d"`,
      'SELECT 2',
    ])
    expect(texts("SELECT 'it\\'s;', `x;y`; SELECT 2", MYSQL_LEXICAL)).toStrictEqual([
      "SELECT 'it\\'s;', `x;y`",
      'SELECT 2',
    ])
  })

  it('should keep a PostgreSQL function body in dollar quotes as one statement', () => {
    const body = `CREATE FUNCTION f() RETURNS int AS $fn$
BEGIN
  PERFORM 1;
  RETURN 2;
END
$fn$ LANGUAGE plpgsql`

    expect(texts(`${body};\nSELECT f();`)).toStrictEqual([body, 'SELECT f()'])
  })

  it('should keep MySQL executable comments as statements', () => {
    expect(texts('/*!40101 SET NAMES utf8 */;\n/* plain */;', MYSQL_LEXICAL)).toStrictEqual([
      '/*!40101 SET NAMES utf8 */',
    ])
  })

  it('should keep an unterminated string and everything after it in the last statement', () => {
    expect(texts("SELECT 1; SELECT 'a; SELECT 3")).toStrictEqual([
      'SELECT 1',
      "SELECT 'a; SELECT 3",
    ])
  })
})

describe('statementAt', () => {
  const sql = 'SELECT 1;\nSELECT 2; -- two\n\n\n   SELECT 3'
  const statements = splitStatements(sql, POSTGRES_LEXICAL)

  function at(offset: number, spans: readonly StatementSpan[] = statements): string | undefined {
    return statementAt(spans, offset, sql)?.text
  }

  it('should find the statement the cursor is in, from its first character to its semicolon', () => {
    expect(at(0)).toBe('SELECT 1')
    expect(at(5)).toBe('SELECT 1')
    expect(at(9)).toBe('SELECT 1')
    expect(at(10)).toBe('SELECT 2')
    expect(at(19)).toBe('SELECT 2')
  })

  it('should keep the cursor right after a semicolon in the statement it ends', () => {
    const text = 'SELECT 1;SELECT 2'

    expect(statementAt(splitStatements(text, POSTGRES_LEXICAL), 9, text)?.text).toBe('SELECT 1')
  })

  it('should find the statement that ends before the cursor when no blank line is in between', () => {
    expect(at(sql.indexOf('--'))).toBe('SELECT 2')
    expect(at(sql.indexOf('two') + 3)).toBe('SELECT 2')
    expect(at(sql.indexOf('two') + 4)).toBe('SELECT 2')
  })

  it('should find the statement that starts later on the line of the cursor', () => {
    expect(at(sql.indexOf('   SELECT 3'))).toBe('SELECT 3')
    expect(at(sql.length)).toBe('SELECT 3')
  })

  it('should find nothing on a blank line between statements', () => {
    expect(at(sql.indexOf('two') + 5)).toBeUndefined()
  })

  it('should find nothing when there is no statement', () => {
    expect(at(0, [])).toBeUndefined()
  })

  it('should find the last statement when the cursor is after every statement on a nearby line', () => {
    const text = 'SELECT 1;\n'
    const spans = splitStatements(text, POSTGRES_LEXICAL)

    expect(statementAt(spans, text.length, text)?.text).toBe('SELECT 1')
    expect(statementAt(spans, text.length + 1, `${text}\n`)).toBeUndefined()
  })

  it('should treat a blank line with spaces or a carriage return as blank', () => {
    const text = 'SELECT 1;\n  \r\n'
    const spans = splitStatements(text, POSTGRES_LEXICAL)

    expect(statementAt(spans, text.length, text)).toBeUndefined()
  })

  it('should not take a statement on the next line when the cursor is before it', () => {
    const text = '\nSELECT 1'
    const spans = splitStatements(text, POSTGRES_LEXICAL)

    expect(statementAt(spans, 0, text)).toBeUndefined()
    expect(statementAt(spans, 0, '\rSELECT 1')).toBeUndefined()
  })
})
