import { describe, expect, it } from 'vitest'

import { toWireRow, toWireValue } from './wire.ts'

describe('toWireValue', () => {
  it('should turn the numbers JSON cannot carry into text and keep the rest', () => {
    expect(toWireValue(Number.NaN)).toBe('NaN')
    expect(toWireValue(Number.NEGATIVE_INFINITY)).toBe('-Infinity')
    expect(toWireValue(1.5)).toBe(1.5)
    expect(toWireValue(null)).toBeNull()
    expect(toWireValue('x')).toBe('x')
  })
})

describe('toWireRow', () => {
  it('should cut long text and list the columns that were cut', () => {
    expect(toWireRow(['abcdef', 'abc', null, Number.POSITIVE_INFINITY, 'xyzw'], 3)).toStrictEqual({
      cells: ['abc', 'abc', null, 'Inf', 'xyz'],
      truncated: [0, 3, 4],
    })
  })

  it('should keep short rows as they are', () => {
    expect(toWireRow([1, true, ''], 10)).toStrictEqual({ cells: [1, true, ''], truncated: [] })
  })
})
