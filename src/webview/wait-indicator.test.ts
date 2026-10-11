import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { IndicatorLook, MIN_SHOWN_MS, SHOW_DELAY_MS } from '../core/grid/loading-indicator.ts'
import { WaitIndicator } from './wait-indicator.ts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WaitIndicator', () => {
  it('should appear on its own once the wait has lasted, and tell its listeners once', () => {
    const sut = new WaitIndicator()
    const listener = vi.fn()
    sut.subscribe(listener)

    sut.follow(true)
    expect(sut.current().look).toBe(IndicatorLook.Hidden)
    vi.advanceTimersByTime(SHOW_DELAY_MS)

    expect(sut.current().look).toBe(IndicatorLook.Shown)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('should tell no listener when nothing changed', () => {
    const sut = new WaitIndicator()
    const listener = vi.fn()
    sut.subscribe(listener)

    sut.follow(false)

    expect(listener).not.toHaveBeenCalled()
  })

  it('should step again when its timer fires before the time of the change', () => {
    const sut = new WaitIndicator()
    sut.follow(true)
    vi.setSystemTime(Date.now() - 5)

    vi.advanceTimersByTime(SHOW_DELAY_MS)
    expect(sut.current().look).toBe(IndicatorLook.Hidden)
    vi.advanceTimersByTime(5)

    expect(sut.current().look).toBe(IndicatorLook.Shown)
  })

  it('should change nothing on its own once stopped, and stop telling a listener that left', () => {
    const sut = new WaitIndicator()
    const listener = vi.fn()
    sut.subscribe(listener)()
    sut.follow(true)

    sut.stop()
    vi.advanceTimersByTime(SHOW_DELAY_MS + MIN_SHOWN_MS)

    expect(sut.current().look).toBe(IndicatorLook.Hidden)
    expect(listener).not.toHaveBeenCalled()
  })
})
