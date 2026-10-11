import { describe, expect, it, vi } from 'vitest'

import { projectedRows, RowStore, WINDOW_ROWS } from './row-store.ts'
import { RowStores } from './row-stores.ts'

const ROW = { cells: [1], truncated: [] }
const NEW_ROW = { cells: [2], truncated: [] }

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

  it('should keep showing the rows of the view before until those of a new view come', () => {
    const sut = new RowStore()
    sut.windowsToFetch({ first: 0, last: 10 }, 500, 0)
    sut.store(0, 0, [ROW])
    expect(sut.isStale()).toBe(false)

    expect(sut.windowsToFetch({ first: 0, last: 10 }, 500, 1)).toStrictEqual([0])
    expect(sut.row(0)).toBe(ROW)
    expect(sut.isStale()).toBe(true)
    sut.store(0, 0, [NEW_ROW])
    expect(sut.row(0)).toBe(ROW)
    expect(sut.revision()).toBe(1)

    sut.store(1, 0, [NEW_ROW])
    expect(sut.row(0)).toBe(NEW_ROW)
    expect(sut.isStale()).toBe(false)
  })

  it('should keep the rows of the last view that had some through views that had none', () => {
    const sut = new RowStore()
    sut.windowsToFetch({ first: 0, last: 10 }, 500, 0)
    sut.store(0, 0, [ROW])

    sut.windowsToFetch({ first: 0, last: 10 }, 500, 1)
    sut.windowsToFetch({ first: 0, last: 10 }, 500, 2)

    expect(sut.row(0)).toBe(ROW)
    expect(sut.isStale()).toBe(true)
  })

  it('should stop telling a listener that unsubscribed', () => {
    const sut = new RowStore()
    const listener = vi.fn()

    sut.subscribe(listener)()
    sut.store(0, 0, [ROW])

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('projectedRows', () => {
  it('should show the rows in the columns the grid shows, in its order', () => {
    const store = new RowStore()
    store.store(0, 0, [{ cells: ['a', 'b', 'c'], truncated: [0, 2] }])

    const sut = projectedRows(store, [2, 0])

    expect(sut.row(0)).toStrictEqual({ cells: ['c', 'a'], truncated: [1, 0] })
    expect(sut.row(1)).toBeUndefined()
    expect(sut.isStale()).toBe(false)
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
