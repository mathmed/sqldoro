import { describe, expect, it } from 'vitest'

import { columnWidth, columnWindow } from './use-column-window.ts'

describe('columnWindow', () => {
  it('should keep the width of the columns before the first one in the page', () => {
    expect(columnWindow([2, 3, 4], [10, 20, 30, 40, 50])).toStrictEqual({
      first: 2,
      last: 4,
      before: 30,
    })
  })

  it('should put no column in the page of a result without columns', () => {
    expect(columnWindow([], [])).toStrictEqual({ first: 0, last: -1, before: 0 })
  })
})

describe('columnWidth', () => {
  it('should give the width of a column, and nothing past the last one', () => {
    expect(columnWidth([10, 20], 1)).toBe(20)
    expect(columnWidth([10, 20], 2)).toBe(0)
  })
})
