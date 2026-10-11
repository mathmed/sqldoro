import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { literalBinder, parameterBinder } from './binders.ts'

describe('parameterBinder', () => {
  it('should number the placeholders from the first one, keeping the values in order', () => {
    const sut = parameterBinder(POSTGRES_DIALECT, 1)

    expect(sut.bind('a', '')).toBe('$2')
    expect(sut.bind(5, 'numeric')).toBe('CAST($3 AS numeric)')
    expect(sut.values()).toStrictEqual(['a', 5])
  })

  it('should use question marks in MySQL', () => {
    const sut = parameterBinder(MYSQL_DIALECT, 0)

    expect([sut.bind(1, ''), sut.bind('9007199254740993', 'SIGNED')]).toStrictEqual([
      '?',
      'CAST(? AS SIGNED)',
    ])
    expect(sut.values()).toStrictEqual([1, '9007199254740993'])
  })
})

describe('literalBinder', () => {
  it('should write numbers as numbers where the column compares numbers', () => {
    const sut = literalBinder(MYSQL_DIALECT)

    expect(sut.bind('9007199254740993', 'SIGNED')).toBe('9007199254740993')
    expect(sut.bind('12.50', 'DECIMAL(10,2)')).toBe('12.50')
    expect(sut.bind('12abc', 'SIGNED')).toBe("'12abc'")
    expect(sut.bind('12', '')).toBe("'12'")
    expect(sut.bind(7, '')).toBe('7')
  })

  it('should write text, booleans and NULL as SQL literals of the dialect', () => {
    expect(literalBinder(MYSQL_DIALECT).bind(String.raw`it's a \ test`, '')).toBe(
      String.raw`'it''s a \\ test'`,
    )
    expect(literalBinder(POSTGRES_DIALECT).bind(String.raw`a\b`, '')).toBe(String.raw`'a\b'`)
    expect(literalBinder(POSTGRES_DIALECT).bind(true, '')).toBe('TRUE')
    expect(literalBinder(POSTGRES_DIALECT).bind(false, '')).toBe('FALSE')
    expect(literalBinder(POSTGRES_DIALECT).bind(null, '')).toBe('NULL')
  })

  it('should bind no value', () => {
    const sut = literalBinder(MYSQL_DIALECT)
    sut.bind('a', '')

    expect(sut.values()).toStrictEqual([])
  })
})
