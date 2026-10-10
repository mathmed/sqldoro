import { describe, expect, it } from 'vitest'

import { describeError, toError } from './errors.ts'

describe('describeError', () => {
  it('should use the message of an error', () => {
    expect(describeError(new Error('Access denied for user "app"'))).toBe(
      'Access denied for user "app"',
    )
  })

  it('should join the distinct messages of an aggregate error without a message of its own', () => {
    const sut = new AggregateError([
      new Error('connect ECONNREFUSED ::1:5432'),
      new Error('connect ECONNREFUSED 127.0.0.1:5432'),
      new Error('connect ECONNREFUSED ::1:5432'),
    ])

    expect(describeError(sut)).toBe(
      'connect ECONNREFUSED ::1:5432; connect ECONNREFUSED 127.0.0.1:5432',
    )
  })

  it('should prefer the message of an aggregate error that has one', () => {
    expect(describeError(new AggregateError([new Error('inner')], 'outer'))).toBe('outer')
  })

  it('should fall back to the name of an empty aggregate error', () => {
    expect(describeError(new AggregateError([]))).toBe('AggregateError')
  })

  it('should use the code of an error without a message', () => {
    expect(describeError(Object.assign(new Error(''), { code: 'ECONNRESET' }))).toBe('ECONNRESET')
  })

  it('should ignore a code that is not text', () => {
    expect(describeError(Object.assign(new TypeError(''), { code: 42 }))).toBe('TypeError')
  })

  it('should use a thrown string as it is', () => {
    expect(describeError('timed out')).toBe('timed out')
  })

  it.each([undefined, null, 42, '', { reason: 'x' }])('should not show %j', (value) => {
    expect(describeError(value)).toBe('Unknown error')
  })
})

describe('toError', () => {
  it('should keep an error as it is', () => {
    const error = new TypeError('bad value')

    expect(toError(error)).toBe(error)
  })

  it('should wrap anything else in an error with a readable message', () => {
    expect(toError('timed out')).toStrictEqual(new Error('timed out'))
    expect(toError(undefined)).toStrictEqual(new Error('Unknown error'))
  })
})
