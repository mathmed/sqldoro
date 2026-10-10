import { describe, expect, it } from 'vitest'

import { matchesFilter } from './filter.ts'

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
