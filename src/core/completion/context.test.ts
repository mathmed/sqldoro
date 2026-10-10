import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { analyzeCompletion, Clause, completionAt, type CompletionContext } from './context.ts'

// The cursor is where the | is.
function at(sqlWithCursor: string, rules = POSTGRES_LEXICAL): CompletionContext {
  const offset = sqlWithCursor.indexOf('|')
  return analyzeCompletion(sqlWithCursor.replace('|', ''), offset, rules)
}

describe('analyzeCompletion', () => {
  it('should read the typed prefix and where it starts', () => {
    expect(at('SELECT na|')).toMatchObject({
      prefix: 'na',
      prefixStart: 7,
      isQuoted: false,
      isInText: false,
      qualifier: [],
    })
  })

  it('should read an empty prefix after a space or a symbol', () => {
    expect(at('SELECT |')).toMatchObject({ prefix: '', prefixStart: 7 })
    expect(at('SELECT (|')).toMatchObject({ prefix: '', prefixStart: 8 })
  })

  it('should read only the part of the word before the cursor', () => {
    expect(at('SELECT na|me FROM t')).toMatchObject({ prefix: 'na', prefixStart: 7 })
  })

  it('should read a quoted prefix without its quote', () => {
    expect(at('SELECT * FROM "Ord|')).toMatchObject({
      prefix: 'Ord',
      prefixStart: 14,
      isQuoted: true,
    })
    expect(at('SELECT * FROM "a""b|')).toMatchObject({ prefix: 'a"b', isQuoted: true })
    expect(at('SELECT * FROM `Ord|', MYSQL_LEXICAL)).toMatchObject({
      prefix: 'Ord',
      isQuoted: true,
    })
  })

  it('should read a closed quoted name as finished when the cursor is after it', () => {
    expect(at('SELECT "a"|')).toMatchObject({ prefix: '', prefixStart: 10, isQuoted: false })
    expect(at('SELECT "ab|c"')).toMatchObject({ prefix: 'ab', isQuoted: true })
  })

  describe('text', () => {
    it.each([
      "SELECT 'ab|",
      "SELECT 'a|b'",
      'SELECT 1 -- note|',
      'SELECT 1 -- no|te',
      'SELECT /* a| */ 1',
      'SELECT /* a|',
    ])('should see that %s is in text', (sql) => {
      expect(at(sql).isInText).toBe(true)
    })

    it.each(["SELECT 'ab'|", "SELECT 'ab' |", 'SELECT /* a */|', 'SELECT 1 -- a\n|'])(
      'should see that %s is not in text',
      (sql) => {
        expect(at(sql).isInText).toBe(false)
      },
    )
  })

  describe('qualifier', () => {
    it('should read the names before the dots', () => {
      expect(at('SELECT o.|')).toMatchObject({ qualifier: ['o'], prefix: '' })
      expect(at('SELECT o.na|')).toMatchObject({ qualifier: ['o'], prefix: 'na', prefixStart: 9 })
      expect(at('SELECT sales.orders.|')).toMatchObject({ qualifier: ['sales', 'orders'] })
      expect(at('SELECT "My Schema".t.|')).toMatchObject({ qualifier: ['My Schema', 't'] })
    })

    it('should read no qualifier when no name is before the dot', () => {
      expect(at('SELECT .|')).toMatchObject({ qualifier: [] })
      expect(at('.|')).toMatchObject({ qualifier: [] })
      expect(at('SELECT 1.|')).toMatchObject({ qualifier: [] })
    })

    it('should read the clause before the qualified name', () => {
      expect(at('SELECT * FROM sales.|').clause).toBe(Clause.Table)
      expect(at('SELECT a.| FROM t a').clause).toBe(Clause.Column)
    })
  })

  describe('clause', () => {
    it.each([
      ['SELECT * FROM |', Clause.Table],
      ['SELECT * FROM a, |', Clause.Table],
      ['SELECT * FROM a JOIN |', Clause.Table],
      ['UPDATE |', Clause.Table],
      ['INSERT INTO |', Clause.Table],
      ['ALTER TABLE |', Clause.Table],
      ['SELECT |', Clause.Column],
      ['SELECT a, | FROM t', Clause.Column],
      ['SELECT * FROM t WHERE |', Clause.Column],
      ['SELECT * FROM t WHERE a = 1 AND |', Clause.Column],
      ['SELECT * FROM t ORDER BY |', Clause.Column],
      ['UPDATE t SET |', Clause.Column],
      ['SELECT * FROM a JOIN b ON |', Clause.Column],
      ['INSERT INTO t (a, |', Clause.Column],
      ['SELECT count(|', Clause.Column],
      ['SELECT * FROM t WHERE a IN (SELECT b FROM u) AND |', Clause.Column],
      ['SELECT * FROM t WHERE a IN (SELECT b FROM |', Clause.Table],
      ['SELECT * FROM (|', Clause.Other],
      ['SELECT * FROM a JOIN (|', Clause.Other],
      ['|', Clause.Other],
      ['EXPLAIN |', Clause.Other],
    ])('should see that %s expects %s', (sql, clause) => {
      expect(at(sql).clause).toBe(clause)
    })

    it.each(['AND', 'BY', 'CASE', 'DISTINCT', 'ELSE', 'HAVING', 'NOT', 'ON', 'OR', 'RETURNING'])(
      'should expect columns right after %s, the closest keyword',
      (keyword) => {
        expect(at(`SELECT * FROM t ${keyword} |`).clause).toBe(Clause.Column)
      },
    )

    it.each(['SELECT', 'SET', 'THEN', 'USING', 'WHEN', 'WHERE'])(
      'should expect columns right after %s, the closest keyword',
      (keyword) => {
        expect(at(`SELECT * FROM t ${keyword} |`).clause).toBe(Clause.Column)
      },
    )

    it.each(['FROM', 'JOIN', 'UPDATE', 'INTO', 'TABLE'])(
      'should expect a table right after %s, the closest keyword',
      (keyword) => {
        expect(at(`SELECT a FROM t WHERE b ${keyword} |`).clause).toBe(Clause.Table)
      },
    )

    it('should skip a subquery between the cursor and its clause', () => {
      expect(at('SELECT * FROM t, (SELECT 1) AS s, |').clause).toBe(Clause.Table)
      expect(at('SELECT * FROM t JOIN (SELECT 1) s ON s.a = (SELECT 2) AND |').clause).toBe(
        Clause.Column,
      )
    })

    it('should not take a qualifier that is a keyword for the clause', () => {
      expect(at('SELECT * FROM t JOIN set.|').clause).toBe(Clause.Table)
    })

    it('should skip a closed parenthesis inside another one', () => {
      expect(at('SELECT * FROM t WHERE f((a), |').clause).toBe(Clause.Column)
      expect(at('SELECT * FROM t WHERE x IN ((SELECT 1 FROM u), |').clause).toBe(Clause.Column)
    })
  })

  it('should read every table when the cursor is at the very start', () => {
    expect(at('|FROM orders')).toMatchObject({
      prefix: '',
      prefixStart: 0,
      references: [{ parts: ['orders'] }],
    })
  })

  it('should keep the tables whose names touch the name being typed', () => {
    expect(at('SELECT * FROM orders"x|').references).toMatchObject([{ parts: ['orders'] }])
    expect(at('SELECT * FROM "ord|"o').references).toMatchObject([{ parts: ['o'] }])
  })

  it('should leave out only the name being typed', () => {
    expect(at('SELECT * FROM orders o WHERE o.|').references).toStrictEqual([
      { parts: ['orders'], alias: 'o' },
    ])
  })

  it('should read the tables of the whole statement, also after the cursor', () => {
    expect(at('SELECT o.| FROM orders o').references).toStrictEqual([
      { parts: ['orders'], alias: 'o' },
    ])
  })
})

describe('completionAt', () => {
  function around(scriptWithCursor: string): ReturnType<typeof completionAt> {
    const offset = scriptWithCursor.indexOf('|')
    return completionAt(scriptWithCursor.replace('|', ''), offset, POSTGRES_LEXICAL)
  }

  it('should read the statement the cursor is in, from its start', () => {
    const sut = around('SELECT 1;\nSELECT o.| FROM orders o;\nSELECT 2')

    expect(sut.base).toBe(10)
    expect(sut.context).toMatchObject({
      qualifier: ['o'],
      prefixStart: 9,
      references: [{ parts: ['orders'], alias: 'o' }],
    })
  })

  it('should read up to the cursor when it is after the last token of the statement', () => {
    const sut = around('SELECT * FROM t WHERE   |;')

    expect(sut.context).toMatchObject({ prefix: '', clause: 'column', prefixStart: 24 })
  })

  it('should offer only keywords outside every statement', () => {
    const sut = around('SELECT 1;\n\n|  \n\nSELECT 2')

    expect(sut.base).toBe(11)
    expect(sut.context).toStrictEqual({
      isInText: false,
      prefix: '',
      prefixStart: 0,
      isQuoted: false,
      qualifier: [],
      clause: 'other',
      references: [],
    })
  })

  it('should read the statement that starts at the cursor', () => {
    const sut = around('SELECT 1;\n|SELECT * FROM orders')

    expect(sut.base).toBe(10)
    expect(sut.context.references).toMatchObject([{ parts: ['orders'] }])
  })

  it('should read the statement whose semicolon is right before the cursor', () => {
    expect(around('SELECT * FROM orders;|').context.references).toMatchObject([
      { parts: ['orders'] },
    ])
  })
})
