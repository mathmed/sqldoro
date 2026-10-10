import { describe, expect, it, vi } from 'vitest'

import { RowStore, WINDOW_ROWS } from './row-store.ts'
import { RowStores } from './row-stores.ts'

const ROW = { cells: [1], truncated: [] }

describe('RowStore', () => {
  it('should ask for the windows of rows it does not hold, and hold what arrives', () => {
    const sut = new RowStore()
    const listener = vi.fn()
    sut.subscribe(listener)

    expect(sut.windowsToFetch({ first: 0, last: 10 }, 500, 0)).toStrictEqual([0])
    sut.store(0, 0, [ROW])

    expect(sut.row(0)).toBe(ROW)
    expect(sut.revision()).toBe(1)
    expect(listener).toHaveBeenCalledOnce()
    expect(WINDOW_ROWS).toBe(200)
  })

  it('should forget its rows for a new view version and drop rows of an older one', () => {
    const sut = new RowStore()
    sut.windowsToFetch({ first: 0, last: 10 }, 500, 0)
    sut.store(0, 0, [ROW])

    expect(sut.windowsToFetch({ first: 0, last: 10 }, 500, 1)).toStrictEqual([0])
    expect(sut.row(0)).toBeUndefined()
    sut.store(0, 0, [ROW])
    expect(sut.row(0)).toBeUndefined()
    expect(sut.revision()).toBe(1)
  })

  it('should stop telling a listener that unsubscribed', () => {
    const sut = new RowStore()
    const listener = vi.fn()

    sut.subscribe(listener)()
    sut.store(0, 0, [ROW])

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('RowStores', () => {
  it('should keep one store per tab and drop the stores of tabs that are gone', () => {
    const sut = new RowStores()

    const first = sut.of('a')
    expect(sut.of('a')).toBe(first)
    sut.of('b')
    sut.retain(new Set(['b']))

    expect(sut.of('a')).not.toBe(first)
  })
})
