import { describe, expect, it, vi } from 'vitest'

import { Cancellation } from './cancellation.ts'

describe('Cancellation', () => {
  it('should send the request once and let every call wait for it', async () => {
    const sut = new Cancellation()
    const send = vi.fn(async () => Promise.resolve())

    await Promise.all([sut.cancel(send), sut.cancel(send)])

    expect(send).toHaveBeenCalledOnce()
    expect(sut.isRequested).toBe(true)
  })

  it('should not be requested until cancel is called', () => {
    expect(new Cancellation().isRequested).toBe(false)
  })

  it('should report a failed request to the callers of cancel', async () => {
    const sut = new Cancellation()

    await expect(sut.cancel(async () => Promise.reject(new Error('denied')))).rejects.toThrow(
      'denied',
    )
  })

  it('should ignore a cancel once the statement is over', async () => {
    const sut = new Cancellation()
    const send = vi.fn(async () => Promise.resolve())

    await sut.finish()
    await sut.cancel(send)

    expect(send).not.toHaveBeenCalled()
    expect(sut.isRequested).toBe(false)
  })

  it('should finish only after the request in flight, even when it fails', async () => {
    const sut = new Cancellation()
    const { promise, reject } = Promise.withResolvers<undefined>()
    const cancelled = sut.cancel(async () => promise)
    let hasFinished = false

    const finished = sut.finish().then(() => {
      hasFinished = true
    })
    await Promise.resolve()
    expect(hasFinished).toBe(false)

    reject(new Error('lost'))
    await finished
    expect(hasFinished).toBe(true)
    await expect(cancelled).rejects.toThrow('lost')
  })
})
