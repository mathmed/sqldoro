import { describe, expect, it } from 'vitest'

import { buildGreeting } from './greeting.ts'

describe('buildGreeting', () => {
  it('should greet without a suffix in an installed build', () => {
    expect(buildGreeting(false)).toBe('Hello from sqldoro!')
  })

  it('should flag a development build', () => {
    expect(buildGreeting(true)).toBe('Hello from sqldoro (development)!')
  })
})
