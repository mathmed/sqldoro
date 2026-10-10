import { describe, expect, it } from 'vitest'

import type { WireRow } from '../results/protocol.ts'
import { RowCache } from './row-cache.ts'

function rows(start: number, count: number): WireRow[] {
  return Array.from({ length: count }, (...[, offset]) => ({
    cells: [start + offset],
    truncated: [],
  }))
}

describe('RowCache', () => {
  it('should ask for the windows that cover the rows, once each', () => {
    const sut = new RowCache(10, 100)

    expect(sut.windowsToFetch(5, 25, 1000)).toStrictEqual([0, 10, 20])
    expect(sut.windowsToFetch(0, 30, 1000)).toStrictEqual([30])
  })

  it('should not ask past the last row', () => {
    const sut = new RowCache(10, 100)

    expect(sut.windowsToFetch(0, 50, 15)).toStrictEqual([0, 10])
    expect(sut.windowsToFetch(0, 50, 0)).toStrictEqual([])
  })

  it('should hold the rows it stored and not ask for them again', () => {
    const sut = new RowCache(10, 100)
    sut.windowsToFetch(0, 9, 15)

    sut.store(0, rows(0, 10))
    sut.store(10, rows(10, 5))

    expect(sut.get(3)).toStrictEqual({ cells: [3], truncated: [] })
    expect(sut.get(14)).toStrictEqual({ cells: [14], truncated: [] })
    expect(sut.get(15)).toBeUndefined()
    expect(sut.size).toBe(15)
    expect(sut.windowsToFetch(0, 20, 15)).toStrictEqual([])
  })

  it('should ask again for a window that is only partly held', () => {
    const sut = new RowCache(10, 100)

    sut.store(0, rows(0, 4))

    expect(sut.windowsToFetch(0, 3, 10)).toStrictEqual([0])
  })

  it('should forget the rows stored first past its limit', () => {
    const sut = new RowCache(10, 20)

    sut.store(0, rows(0, 10))
    sut.store(10, rows(10, 10))
    sut.store(0, rows(0, 10))
    sut.store(20, rows(20, 10))

    expect(sut.size).toBe(20)
    expect(sut.get(10)).toBeUndefined()
    expect(sut.get(0)).toBeDefined()
    expect(sut.get(29)).toBeDefined()
  })

  it('should forget everything when cleared', () => {
    const sut = new RowCache(10, 100)
    sut.windowsToFetch(0, 9, 100)
    sut.store(0, [])

    sut.store(10, rows(10, 10))
    sut.clear()

    expect(sut.size).toBe(0)
    expect(sut.windowsToFetch(0, 15, 100)).toStrictEqual([0, 10])
  })
})
