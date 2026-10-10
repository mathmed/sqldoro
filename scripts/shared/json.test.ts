import { describe, expect, it } from 'vitest'

import { ARRAY, BOOLEAN, field, NUMBER, parseObject, STRING } from './json.ts'

describe('parseObject', () => {
  it('should expose the fields of a JSON object', () => {
    const sut = parseObject({ name: 'lint', count: 2 })

    expect([...sut]).toEqual([
      ['name', 'lint'],
      ['count', 2],
    ])
  })

  it.each([null, 'text', 42, ['a']])('should reject %j', (value) => {
    expect(() => parseObject(value)).toThrow(new TypeError('expected a JSON object'))
  })
})

describe('field', () => {
  const sut = parseObject({ text: 'a', number: 1, flag: false, list: [1], infinite: Infinity })

  it('should return a field of the expected kind', () => {
    expect(field(sut, 'text', STRING)).toBe('a')
    expect(field(sut, 'number', NUMBER)).toBe(1)
    expect(field(sut, 'flag', BOOLEAN)).toBe(false)
    expect(field(sut, 'list', ARRAY)).toEqual([1])
  })

  it.each([
    ['expected "number" to be a string', () => field(sut, 'number', STRING)],
    ['expected "text" to be a number', () => field(sut, 'text', NUMBER)],
    ['expected "infinite" to be a number', () => field(sut, 'infinite', NUMBER)],
    ['expected "text" to be a boolean', () => field(sut, 'text', BOOLEAN)],
    ['expected "text" to be an array', () => field(sut, 'text', ARRAY)],
    ['expected "missing" to be a string', () => field(sut, 'missing', STRING)],
  ])('should reject a field of the wrong kind: %s', (message, read) => {
    expect(read).toThrow(new TypeError(message))
  })
})
