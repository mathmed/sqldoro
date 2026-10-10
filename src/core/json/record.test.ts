import { describe, expect, it } from 'vitest'

import {
  readArray,
  readBoolean,
  readCount,
  readNested,
  readNullable,
  readNullableString,
  readNumber,
  readOneOf,
  readRecord,
  readString,
} from './record.ts'

const RECORD = readRecord({
  text: 'a',
  count: 2,
  flag: false,
  list: [1],
  nested: { inner: 'b' },
  infinite: Number.POSITIVE_INFINITY,
})

describe('readRecord', () => {
  it('should read the entries of an object', () => {
    expect(readRecord({ a: 1 })).toStrictEqual(new Map([['a', 1]]))
  })

  it.each([null, undefined, 'text', 1, []])('should reject %j', (value) => {
    expect(() => readRecord(value)).toThrow(new TypeError('expected an object'))
  })
})

describe('the field readers', () => {
  it('should read each kind of field', () => {
    expect(readString(RECORD, 'text')).toBe('a')
    expect(readNumber(RECORD, 'count')).toBe(2)
    expect(readBoolean(RECORD, 'flag')).toBe(false)
    expect(readArray(RECORD, 'list')).toStrictEqual([1])
    expect(readNested(RECORD, 'nested')).toStrictEqual(new Map([['inner', 'b']]))
  })

  it('should name the field and the expected kind when a field is wrong', () => {
    expect(() => readString(RECORD, 'count')).toThrow(new TypeError('"count" must be a string'))
    expect(() => readNumber(RECORD, 'text')).toThrow(new TypeError('"text" must be a number'))
    expect(() => readBoolean(RECORD, 'missing')).toThrow(
      new TypeError('"missing" must be a boolean'),
    )
    expect(() => readArray(RECORD, 'nested')).toThrow(new TypeError('"nested" must be a list'))
  })

  it('should read a nullable string', () => {
    const record = readRecord({ text: 'a', empty: '', missing: null })

    expect(readNullableString(record, 'text')).toBe('a')
    expect(readNullableString(record, 'empty')).toBe('')
    expect(readNullableString(record, 'missing')).toBeUndefined()
    expect(readNullableString(record, 'absent')).toBeUndefined()
    expect(() => readNullableString(RECORD, 'count')).toThrow(
      new TypeError('"count" must be a string'),
    )
  })

  it('should refuse a number that is not finite', () => {
    expect(() => readNumber(RECORD, 'infinite')).toThrow(
      new TypeError('"infinite" must be a number'),
    )
  })

  it.each(['missing', 'list', 'text'])('should refuse %s as a nested object', (key) => {
    expect(() => readNested(RECORD, key)).toThrow(new TypeError(`"${key}" must be an object`))
  })

  it('should read a value from a fixed set', () => {
    const isLetter = (value: unknown): value is 'a' | 'b' => value === 'a' || value === 'b'

    expect(readOneOf(RECORD, 'text', isLetter)).toBe('a')
    expect(() => readOneOf(RECORD, 'count', isLetter)).toThrow(
      new TypeError('"count" must be a known value'),
    )
  })
})

describe('readCount', () => {
  it('should read whole numbers of 0 or more', () => {
    expect(readCount(readRecord({ n: 0 }), 'n')).toBe(0)
    expect(readCount(readRecord({ n: 12 }), 'n')).toBe(12)
  })

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null])('should reject %j', (value) => {
    expect(() => readCount(readRecord({ n: value }), 'n')).toThrow(
      new TypeError('"n" must be a whole number of 0 or more'),
    )
  })
})

describe('readNullable', () => {
  it('should read null as null and anything else with the reader', () => {
    expect(readNullable(readRecord({ a: null }), 'a', readString)).toBeNull()
    expect(readNullable(readRecord({ a: 'x' }), 'a', readString)).toBe('x')
  })

  it('should reject a missing field through the reader', () => {
    expect(() => readNullable(readRecord({}), 'a', readString)).toThrow(
      new TypeError('"a" must be a string'),
    )
  })
})
