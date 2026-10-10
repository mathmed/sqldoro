import { describe, expect, it, vi } from 'vitest'

import { systemClock } from './clock.ts'

describe('systemClock', () => {
  it('should measure with the performance clock and date in ISO 8601, in UTC', () => {
    vi.spyOn(performance, 'now').mockReturnValue(42.5)
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 10, 3, 4, 5), toFake: ['Date'] })

    expect(systemClock.now()).toBe(42.5)
    expect(systemClock.timestamp()).toBe('2026-10-10T03:04:05.000Z')
    vi.useRealTimers()
  })
})
