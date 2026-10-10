import { describe, expect, it } from 'vitest'

import { QueryError } from '../../core/engine/query-error.ts'
import { locatedError } from './mysql-errors.ts'

describe('locatedError', () => {
  it('should read the line and the quoted text of a syntax error', () => {
    const error = new Error(
      "You have an error in your SQL syntax; check the manual for the right syntax to use near 'FORM t\nWHERE' at line 2",
    )

    const sut = locatedError(error)

    expect(sut).toBeInstanceOf(QueryError)
    expect(sut).toMatchObject({
      message: error.message,
      location: { kind: 'line', line: 2, near: 'FORM t\nWHERE' },
      cause: error,
    })
  })

  it('should read an empty quote and a missing one', () => {
    expect(locatedError(new Error("... to use near '' at line 1"))).toMatchObject({
      location: { kind: 'line', line: 1, near: '' },
    })
    expect(locatedError(new Error('Something odd at line 3'))).toMatchObject({
      location: { kind: 'line', line: 3, near: '' },
    })
  })

  it('should let other errors through', () => {
    const error = new Error("Table 'shop.missing' doesn't exist")

    expect(locatedError(error)).toBe(error)
  })
})
