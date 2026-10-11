import { describe, expect, it } from 'vitest'

import { filterHighlights, matchesFilter } from './filter.ts'

describe('matchesFilter', () => {
  it('should match a part of the name whatever its case', () => {
    expect(matchesFilter('Order_Items', 'ITEM')).toBe(true)
  })

  it('should ignore the spaces around the filter', () => {
    expect(matchesFilter('orders', '  ord ')).toBe(true)
  })

  it('should match everything with an empty filter', () => {
    expect(matchesFilter('orders', '   ')).toBe(true)
  })

  it('should not match a name without the filter', () => {
    expect(matchesFilter('orders', 'users')).toBe(false)
  })
})

describe('filterHighlights', () => {
  it('should find the first match of the filter, whatever its case', () => {
    expect(filterHighlights('CondominiumTransaction', ' trans ')).toStrictEqual([[11, 16]])
    expect(filterHighlights('aXa', 'a')).toStrictEqual([[0, 1]])
  })

  it('should find nothing for an empty filter, or a name without it', () => {
    expect(filterHighlights('orders', '  ')).toStrictEqual([])
    expect(filterHighlights('orders', 'users')).toStrictEqual([])
  })
})
