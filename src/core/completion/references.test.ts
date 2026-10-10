import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { significantTokens } from '../sql/statement-kind.ts'
import { readName, soleTable, tableReferences } from './references.ts'

function references(sql: string, rules = POSTGRES_LEXICAL): ReturnType<typeof tableReferences> {
  return tableReferences(significantTokens(sql, rules))
}

describe('tableReferences', () => {
  it('should read the tables after FROM and JOIN with their aliases', () => {
    expect(
      references('SELECT * FROM orders o JOIN sales.customers AS c ON c.id = o.customer_id'),
    ).toStrictEqual([
      { parts: ['orders'], alias: 'o' },
      { parts: ['sales', 'customers'], alias: 'c' },
    ])
  })

  it('should read a list of tables after FROM', () => {
    expect(references('SELECT * FROM a x, b, "Weird ""T""" w WHERE 1 = 1')).toStrictEqual([
      { parts: ['a'], alias: 'x' },
      { parts: ['b'], alias: undefined },
      { parts: ['Weird "T"'], alias: 'w' },
    ])
  })

  it('should stop a FROM list at a keyword', () => {
    expect(references('SELECT * FROM a WHERE b = 1')).toStrictEqual([
      { parts: ['a'], alias: undefined },
    ])
  })

  it('should not read lists after JOIN', () => {
    expect(references('SELECT * FROM a JOIN b, c')).toStrictEqual([
      { parts: ['a'], alias: undefined },
      { parts: ['b'], alias: undefined },
    ])
  })

  it('should read the tables of UPDATE, INSERT INTO and TABLE', () => {
    expect(references('UPDATE t1 SET a = 1')).toStrictEqual([{ parts: ['t1'], alias: undefined }])
    expect(references('INSERT INTO `db`.`t2` (a) VALUES (1)', MYSQL_LEXICAL)).toStrictEqual([
      { parts: ['db', 't2'], alias: undefined },
    ])
    expect(references('TABLE t3')).toStrictEqual([{ parts: ['t3'], alias: undefined }])
  })

  it('should skip subqueries and keywords where a table would be', () => {
    expect(references('SELECT * FROM (SELECT 1) AS s')).toStrictEqual([])
    expect(references('SELECT * FROM WHERE')).toStrictEqual([])
  })

  it('should not take a keyword or a missing name for an alias', () => {
    expect(references('SELECT * FROM t AS WHERE')).toStrictEqual([
      { parts: ['t'], alias: undefined },
    ])
    expect(references('SELECT * FROM t AS')).toStrictEqual([{ parts: ['t'], alias: undefined }])
    expect(references('SELECT * FROM t LEFT JOIN u NATURAL')).toStrictEqual([
      { parts: ['t'], alias: undefined },
      { parts: ['u'], alias: undefined },
    ])
  })

  it('should read a quoted alias', () => {
    expect(references('SELECT * FROM t "My Alias"')).toStrictEqual([
      { parts: ['t'], alias: 'My Alias' },
    ])
  })
})

describe('readName', () => {
  it('should read a dotted name and where it ends', () => {
    const tokens = significantTokens('a.b.c d', POSTGRES_LEXICAL)

    expect(readName(tokens, 0)).toStrictEqual({ value: ['a', 'b', 'c'], next: 5 })
  })

  it('should keep the parts before a dot that nothing follows', () => {
    const tokens = significantTokens('a.', POSTGRES_LEXICAL)

    expect(readName(tokens, 0)).toStrictEqual({ value: ['a'], next: 2 })
  })

  it('should read nothing at a symbol or a reserved word', () => {
    expect(readName(significantTokens('(', POSTGRES_LEXICAL), 0)).toStrictEqual({
      value: [],
      next: 0,
    })
    expect(readName(significantTokens('from', POSTGRES_LEXICAL), 0)).toStrictEqual({
      value: [],
      next: 0,
    })
  })
})

describe('soleTable', () => {
  it('should name the table of a statement that reads exactly one', () => {
    expect(
      soleTable(significantTokens('SELECT * FROM sales.orders o WHERE 1 = 1', POSTGRES_LEXICAL)),
    ).toStrictEqual(['sales', 'orders'])
  })

  it('should name nothing for no table or several', () => {
    expect(soleTable(significantTokens('SELECT 1', POSTGRES_LEXICAL))).toBeUndefined()
    expect(
      soleTable(significantTokens('SELECT * FROM a JOIN b ON true', POSTGRES_LEXICAL)),
    ).toBeUndefined()
  })
})
