import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { delay, TimeoutError, withTimeout } from './timeout.ts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('should give the outcome of work that ends in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 100, 'late')).resolves.toBe('done')
    await expect(withTimeout(Promise.reject(new Error('broken')), 100, 'late')).rejects.toThrow(
      'broken',
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('should fail with the message when the work takes too long', async () => {
    const work = new Promise<string>(() => undefined)
    const outcome = withTimeout(work, 100, 'The keyring did not answer')

    vi.advanceTimersByTime(99)
    const pending = vi.fn()
    void outcome.then(pending, pending)
    await Promise.resolve()
    expect(pending).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await expect(outcome).rejects.toThrow(new TimeoutError('The keyring did not answer'))
    await expect(outcome).rejects.toMatchObject({ name: 'TimeoutError' })
  })
})

describe('delay', () => {
  it('should resolve once the time went by, not before', async () => {
    let isDone = false
    const sut = delay(150).then(() => {
      isDone = true
    })

    await vi.advanceTimersByTimeAsync(149)
    expect(isDone).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await sut

    expect(isDone).toBe(true)
  })
})
