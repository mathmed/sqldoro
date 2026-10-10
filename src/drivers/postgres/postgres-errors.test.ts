import { describe, expect, it } from 'vitest'

import { QueryError } from '../../core/engine/query-error.ts'
import { locatedError } from './postgres-errors.ts'

describe('locatedError', () => {
  it('should turn the 1-based position of the server into an offset', () => {
    const error = Object.assign(new Error('syntax error'), { position: '1' })

    const sut = locatedError(error)

    expect(sut).toBeInstanceOf(QueryError)
    expect(sut).toMatchObject({ location: { kind: 'offset', offset: 0 }, cause: error })
  })

  it.each([undefined, '', '0', '-2', 'x', 12])(
    'should let an error with position %j through',
    (position) => {
      const error = Object.assign(new Error('failed'), { position })

      expect(locatedError(error)).toBe(error)
    },
  )

  it('should let an error without a position through', () => {
    const error = new Error('failed')

    expect(locatedError(error)).toBe(error)
  })
})
