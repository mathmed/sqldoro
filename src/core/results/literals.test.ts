import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { ColumnKind } from '../engine/query.ts'
import { isPlainNumber, sqlLiteral, stringLiteral } from './literals.ts'

describe('isPlainNumber', () => {
  it.each(['0', '-12', '12.50', '-0.001', '9007199254740993'])('should accept %s', (text) => {
    expect(isPlainNumber(text)).toBe(true)
  })

  it.each(['', '1.', '.5', '+1', '1e5', '1.2.3', 'NaN', '1 ', '-', '1.x'])(
    'should refuse %s',
    (text) => {
      expect(isPlainNumber(text)).toBe(false)
    },
  )
})

describe('stringLiteral', () => {
  it('should double quotes, and backslashes where the dialect reads escapes', () => {
    expect(stringLiteral("it's a \\ path", POSTGRES_DIALECT)).toBe("'it''s a \\ path'")
    expect(stringLiteral("it's a \\ path", MYSQL_DIALECT)).toBe("'it''s a \\\\ path'")
  })
})

describe('sqlLiteral', () => {
  it('should write NULL, booleans and numbers without quotes', () => {
    expect(sqlLiteral(null, ColumnKind.Text, MYSQL_DIALECT)).toBe('NULL')
    expect(sqlLiteral(true, ColumnKind.Boolean, MYSQL_DIALECT)).toBe('TRUE')
    expect(sqlLiteral(false, ColumnKind.Boolean, MYSQL_DIALECT)).toBe('FALSE')
    expect(sqlLiteral(1.5, ColumnKind.Number, MYSQL_DIALECT)).toBe('1.5')
    expect(sqlLiteral(-3, ColumnKind.Text, MYSQL_DIALECT)).toBe('-3')
  })

  it('should quote numbers that have no literal', () => {
    expect(sqlLiteral(Number.NaN, ColumnKind.Number, POSTGRES_DIALECT)).toBe("'NaN'")
    expect(sqlLiteral(Number.NEGATIVE_INFINITY, ColumnKind.Number, POSTGRES_DIALECT)).toBe(
      "'-Infinity'",
    )
  })

  it('should keep every digit of exact numbers in number columns, unquoted', () => {
    expect(sqlLiteral('9007199254740993', ColumnKind.Number, MYSQL_DIALECT)).toBe(
      '9007199254740993',
    )
    expect(sqlLiteral('-0.000001', ColumnKind.Number, MYSQL_DIALECT)).toBe('-0.000001')
  })

  it('should quote text in number columns that is not a plain number, and numbers in text columns', () => {
    expect(sqlLiteral('NaN', ColumnKind.Number, POSTGRES_DIALECT)).toBe("'NaN'")
    expect(sqlLiteral('42', ColumnKind.Text, POSTGRES_DIALECT)).toBe("'42'")
  })

  it('should write binary values in the hexadecimal form of each dialect', () => {
    expect(sqlLiteral('0x00ff', ColumnKind.Binary, MYSQL_DIALECT)).toBe("X'00ff'")
    expect(sqlLiteral('0x00FF', ColumnKind.Binary, POSTGRES_DIALECT)).toBe("'\\x00FF'")
    expect(sqlLiteral('0x', ColumnKind.Binary, MYSQL_DIALECT)).toBe("X''")
  })

  it('should quote binary columns that do not hold hexadecimal text, and hex text elsewhere', () => {
    expect(sqlLiteral('0xzz', ColumnKind.Binary, MYSQL_DIALECT)).toBe("'0xzz'")
    expect(sqlLiteral('0x00', ColumnKind.Text, MYSQL_DIALECT)).toBe("'0x00'")
  })

  it('should escape the backslash of a bytea literal where the dialect reads escapes', () => {
    expect(
      sqlLiteral('0x01', ColumnKind.Binary, {
        ...POSTGRES_DIALECT,
        lexical: MYSQL_DIALECT.lexical,
      }),
    ).toBe("'\\\\x01'")
  })
})
