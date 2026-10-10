import { describe, expect, it, vi } from 'vitest'

import { ConnectionWatch } from './connection-watch.ts'

describe('ConnectionWatch', () => {
  it('should tell the owner about the first failure only', () => {
    const onUnexpectedClose = vi.fn()
    const sut = new ConnectionWatch(onUnexpectedClose)
    const lost = new Error('connection lost')

    sut.report(lost)
    sut.report(new Error('socket closed'))

    expect(onUnexpectedClose).toHaveBeenCalledExactlyOnceWith(lost)
  })

  it('should not tell the owner about an end that close() caused', () => {
    const onUnexpectedClose = vi.fn()
    const sut = new ConnectionWatch(onUnexpectedClose)

    sut.close()
    sut.report(new Error('connection ended'))

    expect(onUnexpectedClose).not.toHaveBeenCalled()
  })

  it('should tell every listener about every failure, even after close()', () => {
    const sut = new ConnectionWatch(vi.fn())
    const first = vi.fn()
    const second = vi.fn()
    sut.listen(first)
    sut.listen(second)
    const lost = new Error('connection lost')

    sut.close()
    sut.report(lost)

    expect(first).toHaveBeenCalledExactlyOnceWith(lost)
    expect(second).toHaveBeenCalledExactlyOnceWith(lost)
  })

  it('should stop telling a listener that stopped listening', () => {
    const sut = new ConnectionWatch(vi.fn())
    const listener = vi.fn()
    const stop = sut.listen(listener)

    stop()
    sut.report(new Error('connection lost'))

    expect(listener).not.toHaveBeenCalled()
  })

  it('should let a listener stop listening while it is being told', () => {
    const sut = new ConnectionWatch(vi.fn())
    const later = vi.fn()
    const stop = sut.listen(() => {
      stop()
    })
    sut.listen(later)

    sut.report(new Error('first'))
    sut.report(new Error('second'))

    expect(later).toHaveBeenCalledTimes(2)
  })
})
