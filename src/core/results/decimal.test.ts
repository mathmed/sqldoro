import { describe, expect, it } from 'vitest'

import { compareNumericKeys, numericKey } from './decimal.ts'

function compare(left: number | string, right: number | string): number {
  return compareNumericKeys(numericKey(left), numericKey(right))
}

function sorted(values: readonly (number | string)[]): (number | string)[] {
  return values.toSorted(compare)
}

describe('numeric keys', () => {
  it('should order exact numbers beyond the precision of a double', () => {
    expect(compare('9007199254740993', '9007199254740992')).toBe(1)
    expect(compare('9007199254740992', '9007199254740993')).toBe(-1)
    expect(compare('12345678901234.123457', '12345678901234.123456')).toBe(1)
  })

  it('should see the same number written in different ways as equal', () => {
    expect(compare('1.50', '1.5')).toBe(0)
    expect(compare('001', '1')).toBe(0)
    expect(compare('1e3', '1000')).toBe(0)
    expect(compare('0.0', '-0')).toBe(0)
    expect(compare(1.5, '1.5')).toBe(0)
    expect(compare('+2', '2')).toBe(0)
    expect(compare('.5', '0.5')).toBe(0)
    expect(compare('5.', '5')).toBe(0)
  })

  it('should order signs, magnitudes and fractions', () => {
    expect(sorted(['10', '-2', '0', '2', '-10', '0.5', '-0.5', '1E-2', '100'])).toStrictEqual([
      '-10',
      '-2',
      '-0.5',
      '0',
      '1E-2',
      '0.5',
      '2',
      '10',
      '100',
    ])
  })

  it('should order numbers in exponent notation', () => {
    expect(sorted([1e21, 2e-7, 5, '3e+20'])).toStrictEqual([2e-7, 5, '3e+20', 1e21])
  })

  it('should put -Infinity first and Infinity then NaN after every number', () => {
    expect(sorted(['NaN', 'Infinity', '1', '-Infinity', Number.NaN, '-1'])).toStrictEqual([
      '-Infinity',
      '-1',
      '1',
      'Infinity',
      'NaN',
      Number.NaN,
    ])
  })

  it('should put text that is not a number last, ordered by its text', () => {
    expect(sorted(['b', 'NaN', '1', 'a', '1.2.3', '1e', 'e5', '1x', ''])).toStrictEqual([
      '1',
      'NaN',
      '',
      '1.2.3',
      '1e',
      '1x',
      'a',
      'b',
      'e5',
    ])
    expect(compare('a', 'a')).toBe(0)
  })

  it('should read the parts of the key', () => {
    expect(numericKey('-12.50')).toStrictEqual({
      rank: 0,
      decimal: { sign: -1, digits: '125', exponent: 2 },
      text: '-12.50',
    })
    expect(numericKey('0.0012')).toStrictEqual({
      rank: 0,
      decimal: { sign: 1, digits: '12', exponent: -2 },
      text: '0.0012',
    })
    expect(numericKey('000')).toStrictEqual({
      rank: 0,
      decimal: { sign: 0, digits: '', exponent: 0 },
      text: '000',
    })
    expect(numericKey('1e5e3')).toMatchObject({ rank: 3 })
  })
})
