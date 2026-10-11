import { describe, expect, it } from 'vitest'

import { type ValueSpec, ValueType } from '../engine/table.ts'
import { isEditable, readValue, setOptions, setText } from './values.ts'

const TINYINT: ValueSpec = { type: ValueType.Integer, min: '-128', max: '127' }
const INT8: ValueSpec = {
  type: ValueType.Integer,
  min: '-9223372036854775808',
  max: '9223372036854775807',
}
const UNSIGNED_BIGINT: ValueSpec = {
  type: ValueType.Integer,
  min: '0',
  max: '18446744073709551615',
}
const DECIMAL_10_2: ValueSpec = { type: ValueType.Decimal, precision: 10, scale: 2 }
const NUMERIC: ValueSpec = { type: ValueType.Decimal, precision: 0, scale: 0 }

function value(input: string, spec: ValueSpec): string | undefined {
  const reading = readValue(input, spec)
  return reading.isValid ? reading.value : undefined
}

function problem(input: string, spec: ValueSpec): string | undefined {
  const reading = readValue(input, spec)
  return reading.isValid ? undefined : reading.problem
}

describe('readValue', () => {
  describe('whole numbers', () => {
    it.each(['0', '-128', '127', '42', '-1', '-0'])('should take %s as it is typed', (input) => {
      expect(value(input, TINYINT)).toBe(input)
    })

    it.each(['128', '-129', '', '+1', '01', '-01', ' 1', '1 ', '1.0', '1e3', 'abc', '--1'])(
      'should refuse %j',
      (input) => {
        expect(problem(input, TINYINT)).toBe('Type a whole number from -128 to 127.')
      },
    )

    it('should compare the limits of 64 bits exactly', () => {
      expect(value('9223372036854775807', INT8)).toBe('9223372036854775807')
      expect(value('-9223372036854775808', INT8)).toBe('-9223372036854775808')
      expect(problem('9223372036854775808', INT8)).toBeDefined()
      expect(problem('-9223372036854775809', INT8)).toBeDefined()
      expect(value('18446744073709551615', UNSIGNED_BIGINT)).toBe('18446744073709551615')
      expect(problem('18446744073709551616', UNSIGNED_BIGINT)).toBe(
        'Type a whole number from 0 to 18446744073709551615.',
      )
      expect(problem('-1', UNSIGNED_BIGINT)).toBeDefined()
    })
  })

  describe('exact numbers', () => {
    it.each(['12345678.99', '-12345678.99', '0.5', '-0.5', '0', '12', '1.1', '0.05', '99999999'])(
      'should take %s within decimal(10,2)',
      (input) => {
        expect(value(input, DECIMAL_10_2)).toBe(input)
      },
    )

    it.each([
      '123456789.99',
      '123456789',
      '1.234',
      '1.',
      '.5',
      '01.5',
      '1.2.3',
      '1.-2',
      '1.5x',
      '-',
      '-.5',
      'abc',
      '1e2',
      '+1',
      '',
      '1,5',
    ])('should refuse %j within decimal(10,2), never rounding it', (input) => {
      expect(problem(input, DECIMAL_10_2)).toBe(
        'Type a number with at most 8 digits before the point and 2 after it.',
      )
    })

    it('should take any number of digits when the column has no precision', () => {
      expect(value('123456789012345678901234567890.123456789', NUMERIC)).toBeDefined()
      expect(problem('1.', NUMERIC)).toBe('Type a number, such as -12.5.')
      expect(problem('12a', NUMERIC)).toBe('Type a number, such as -12.5.')
    })

    it('should take whole numbers only, of the precision, when the scale is 0', () => {
      const spec: ValueSpec = { type: ValueType.Decimal, precision: 5, scale: 0 }

      expect(value('12345', spec)).toBe('12345')
      expect(value('-12345', spec)).toBe('-12345')
      expect(problem('123456', spec)).toBe('Type a whole number of at most 5 digits.')
      expect(problem('1.5', spec)).toBe('Type a whole number of at most 5 digits.')
    })

    it('should count a lone 0 before the point as no digit', () => {
      const spec: ValueSpec = { type: ValueType.Decimal, precision: 3, scale: 3 }

      expect(value('0.123', spec)).toBe('0.123')
      expect(value('-0.123', spec)).toBe('-0.123')
      expect(problem('1.123', spec)).toBeDefined()
    })
  })

  describe('floating-point numbers', () => {
    const FLOAT: ValueSpec = { type: ValueType.Float }

    it.each(['0', '-1.5', '2e-3', '2E+3', '1.5e10', '123', '-0.0'])('should take %s', (input) => {
      expect(value(input, FLOAT)).toBe(input)
    })

    it.each([
      'NaN',
      'Infinity',
      '-Infinity',
      '1e999',
      '.5',
      '1.',
      '1e',
      'e5',
      '1e5.5',
      '0x10',
      '',
      ' 1',
      '1,5',
      '1.2.3',
      '1e2e3',
      '01',
    ])('should refuse %j', (input) => {
      expect(problem(input, FLOAT)).toBe('Type a number, such as -1.5 or 2e-3.')
    })
  })

  describe('booleans', () => {
    const BOOLEAN: ValueSpec = { type: ValueType.Boolean }

    it.each([
      ['true', 'true'],
      ['FALSE', 'false'],
      ['True', 'true'],
    ])('should take %s as %s', (input, expected) => {
      expect(value(input, BOOLEAN)).toBe(expected)
    })

    it.each(['t', '1', 'yes', '', 'truee'])('should refuse %j', (input) => {
      expect(problem(input, BOOLEAN)).toBe('Type true or false.')
    })
  })

  describe('text', () => {
    const VARCHAR_3: ValueSpec = { type: ValueType.Text, maxLength: 3 }

    it.each(['abc', '', 'a b', '😀😀😀', 'çãé'])('should take %j within 3 characters', (input) => {
      expect(value(input, VARCHAR_3)).toBe(input)
    })

    it('should refuse more characters than the column holds, saying how many', () => {
      expect(problem('abcd', VARCHAR_3)).toBe('At most 3 characters: this has 4.')
      expect(problem('😀😀😀😀', VARCHAR_3)).toBe('At most 3 characters: this has 4.')
    })

    it('should take any length when the column has no limit', () => {
      const long = 'x'.repeat(100_000)

      expect(value(long, { type: ValueType.Text, maxLength: 0 })).toBe(long)
    })
  })
})

describe('isEditable', () => {
  it('should tell the specs that take values from the read-only ones', () => {
    expect(isEditable({ type: ValueType.Text, maxLength: 0 })).toBe(true)
    expect(
      isEditable({ type: ValueType.ReadOnly, reason: 'Binary values are shown read-only.' }),
    ).toBe(false)
  })
})

describe('setOptions and setText', () => {
  it('should read the options of a SET value', () => {
    expect(setOptions('')).toStrictEqual([])
    expect(setOptions('b,a')).toStrictEqual(['b', 'a'])
  })

  it('should write the options chosen in the order of the column', () => {
    const sut = setText(['a', 'b', 'c'], ['c', 'a'])

    expect(sut).toBe('a,c')
    expect(setText(['a', 'b'], [])).toBe('')
  })
})
