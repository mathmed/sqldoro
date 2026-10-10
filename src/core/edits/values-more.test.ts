import { describe, expect, it, vi } from 'vitest'

import { type ValueSpec, ValueType } from '../engine/table.ts'
import { readValue } from './values.ts'

function value(input: string, spec: ValueSpec): string | undefined {
  const reading = readValue(input, spec)
  return reading.isValid ? reading.value : undefined
}

function problem(input: string, spec: ValueSpec): string | undefined {
  const reading = readValue(input, spec)
  return reading.isValid ? undefined : reading.problem
}

describe('readValue', () => {
  describe('dates and times', () => {
    const DATE: ValueSpec = { type: ValueType.Date, minYear: 1000, maxYear: 9999 }
    const TIME: ValueSpec = { type: ValueType.Time, fraction: 6, maxHour: 23, hasTimeZone: false }
    const DATETIME: ValueSpec = {
      type: ValueType.Timestamp,
      fraction: 3,
      hasTimeZone: false,
      minYear: 1000,
      maxYear: 9999,
    }

    it('should take what the server writes, as it is typed', () => {
      expect(value('2026-01-02', DATE)).toBe('2026-01-02')
      expect(value('12:30:00.5', TIME)).toBe('12:30:00.5')
      expect(value('2026-01-02 03:04:05.678', DATETIME)).toBe('2026-01-02 03:04:05.678')
    })

    it('should say the form each takes', () => {
      expect(problem('2026-02-30', DATE)).toBe('Type a date as YYYY-MM-DD, from year 1000 to 9999.')
      expect(problem('25:00:00', TIME)).toBe(
        'Type a time as HH:MM:SS, with at most 6 digits after the second.',
      )
      expect(problem('25:00:00', { ...TIME, fraction: 0, hasTimeZone: true })).toBe(
        'Type a time as HH:MM:SS and its UTC offset, such as +02:00.',
      )
      expect(problem('2026-01-02', DATETIME)).toBe(
        'Type a date and time as YYYY-MM-DD HH:MM:SS, with at most 3 digits after the second, from year 1000 to 9999.',
      )
      expect(problem('2026-01-02 01:00:00', { ...DATETIME, fraction: 6, hasTimeZone: true })).toBe(
        'Type a date and time as YYYY-MM-DD HH:MM:SS, with at most 6 digits after the second and its UTC offset, such as +02:00, from year 1000 to 9999.',
      )
    })
  })

  describe('years', () => {
    const YEAR: ValueSpec = { type: ValueType.Year }

    it.each(['1901', '2155', '0000', '2026'])('should take %s', (input) => {
      expect(value(input, YEAR)).toBe(input)
    })

    it.each(['1900', '2156', '26', '02026', '', '0', '000', 'abcd'])(
      'should refuse %j',
      (input) => {
        expect(problem(input, YEAR)).toBe('Type a year from 1901 to 2155, or 0000.')
      },
    )
  })

  describe('JSON', () => {
    const JSON_SPEC: ValueSpec = { type: ValueType.Json }

    it.each(['{"a": 1}', '[1,2]', '"x"', '1', 'null', ' {} ', '{"n": 12345678901234567890.5}'])(
      'should take %s exactly as it is typed',
      (input) => {
        expect(value(input, JSON_SPEC)).toBe(input)
      },
    )

    it.each(['{a: 1}', '', '{', "{'a': 1}", 'NaN'])('should refuse %j', (input) => {
      expect(problem(input, JSON_SPEC)).toBe('Type valid JSON.')
    })

    it('should rethrow what is not a JSON syntax error', () => {
      vi.spyOn(JSON, 'parse').mockImplementation(() => {
        throw new RangeError('too deep')
      })

      expect(() => readValue('[[[]]]', JSON_SPEC)).toThrow(RangeError)
    })
  })

  describe('choices', () => {
    const ENUM: ValueSpec = {
      type: ValueType.Choice,
      options: ['new', "it's done", ''],
      isMultiple: false,
    }
    const SET: ValueSpec = { type: ValueType.Choice, options: ['a', 'b', 'c'], isMultiple: true }

    it.each(['new', "it's done", ''])('should take the value %j of an enum', (input) => {
      expect(value(input, ENUM)).toBe(input)
    })

    it.each(['New', 'x', ' new'])('should refuse %j for an enum, listing its values', (input) => {
      expect(problem(input, ENUM)).toBe('Type one of: "new", "it\'s done", "".')
    })

    it.each(['', 'a', 'a,b', 'c,a', 'a,b,c'])('should take the set %j', (input) => {
      expect(value(input, SET)).toBe(input)
    })

    it.each(['a,a', 'a,d', 'a, b', 'A', ',', 'a,'])('should refuse the set %j', (input) => {
      expect(problem(input, SET)).toBe('Type some of these, separated by commas: "a", "b", "c".')
    })

    it('should list at most ten values', () => {
      const options = Array.from({ length: 12 }, (...[, index]) => `v${String(index)}`)
      const listed = options
        .slice(0, 10)
        .map((option) => `"${option}"`)
        .join(', ')

      expect(problem('x', { type: ValueType.Choice, options, isMultiple: false })).toBe(
        `Type one of: ${listed}….`,
      )
      expect(
        problem('x', { type: ValueType.Choice, options: options.slice(0, 10), isMultiple: false }),
      ).toBe(`Type one of: ${listed}.`)
    })
  })

  describe('UUIDs', () => {
    const UUID: ValueSpec = { type: ValueType.Uuid }

    it.each(['123e4567-e89b-12d3-a456-426614174000', 'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'])(
      'should take %s',
      (input) => {
        expect(value(input, UUID)).toBe(input)
      },
    )

    it.each([
      '123e4567e89b12d3a456426614174000',
      '{123e4567-e89b-12d3-a456-426614174000}',
      '123e4567-e89b-12d3-a456-42661417400g',
      '123e4567-e89b-12d3-a456-42661417400',
      '123e4567-e89b-12d3-a456-4266141740000',
      ' 123e4567-e89b-12d3-a456-426614174000',
    ])('should refuse %s', (input) => {
      expect(problem(input, UUID)).toBe(
        'Type a UUID, such as 123e4567-e89b-12d3-a456-426614174000.',
      )
    })
  })

  it.each(['', '{1,2}', 'anything at all'])(
    'should hand %j to the server, which checks it with its own rules',
    (input) => {
      expect(value(input, { type: ValueType.Server })).toBe(input)
    },
  )

  it('should refuse any value for a read-only column, saying why', () => {
    const spec: ValueSpec = {
      type: ValueType.ReadOnly,
      reason: 'Binary values are shown read-only.',
    }

    expect(problem('0x00', spec)).toBe('Binary values are shown read-only.')
    expect(problem('', spec)).toBe('Binary values are shown read-only.')
  })
})
