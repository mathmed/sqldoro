import { describe, expect, it } from 'vitest'

import { ErrorLocationKind, QueryError } from './query-error.ts'

describe('QueryError', () => {
  it('should keep the message of the server, where it located the error and the cause', () => {
    const cause = new Error('raw')
    const sut = new QueryError(
      'syntax error at or near "FORM"',
      { kind: ErrorLocationKind.Offset, offset: 9 },
      { cause },
    )

    expect(sut).toBeInstanceOf(Error)
    expect(sut.name).toBe('QueryError')
    expect(sut.message).toBe('syntax error at or near "FORM"')
    expect(sut.location).toStrictEqual({ kind: 'offset', offset: 9 })
    expect(sut.cause).toBe(cause)
  })
})
