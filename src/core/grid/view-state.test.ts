import { describe, expect, it } from 'vitest'

import { FilterOperator } from '../results/conditions.ts'
import {
  columnFilters,
  sortedBy,
  sortingOf,
  sortOf,
  withColumnFilters,
  withoutSort,
} from './view-state.ts'

const AB = { column: 1, operator: FilterOperator.Contains, values: ['ab'] }
const VIEW = {
  sort: [
    { column: 2, isDescending: true },
    { column: 0, isDescending: false },
  ],
  filters: [AB],
}

describe('view state', () => {
  it('should write a sort as column ids', () => {
    expect(sortingOf(VIEW)).toStrictEqual([
      { id: '2', isDescending: true },
      { id: '0', isDescending: false },
    ])
  })

  it('should read the sort back', () => {
    expect(sortOf(sortingOf(VIEW))).toStrictEqual(VIEW.sort)
  })

  it('should leave out what is not a column position', () => {
    expect(
      sortOf([
        { id: 'x', isDescending: true },
        { id: '1a', isDescending: false },
        { id: 'a1', isDescending: false },
        { id: '3', isDescending: false },
        { id: '12', isDescending: true },
      ]),
    ).toStrictEqual([
      { column: 3, isDescending: false },
      { column: 12, isDescending: true },
    ])
  })
})

describe('withColumnFilters and columnFilters', () => {
  it('should set, replace and remove the filters of a column, keeping the sort', () => {
    const greater = { operator: FilterOperator.Greater, values: ['1'] }
    const less = { operator: FilterOperator.Less, values: ['9'] }
    const added = withColumnFilters(VIEW, 3, [greater, less])
    const replaced = withColumnFilters(added, 1, [less])
    const removed = withColumnFilters(replaced, 3, [])

    expect(added).toStrictEqual({
      sort: VIEW.sort,
      filters: [AB, { ...greater, column: 3 }, { ...less, column: 3 }],
    })
    expect(replaced.filters).toStrictEqual([
      { ...greater, column: 3 },
      { ...less, column: 3 },
      { ...less, column: 1 },
    ])
    expect(removed).toStrictEqual({ sort: VIEW.sort, filters: [{ ...less, column: 1 }] })
  })

  it('should read the filters of a column, none without them', () => {
    expect(columnFilters(VIEW, 1)).toStrictEqual([AB])
    expect(columnFilters(VIEW, 0)).toStrictEqual([])
  })
})

describe('sortedBy and withoutSort', () => {
  it('should sort by one column alone, either way, keeping the filters', () => {
    expect(sortedBy(VIEW, 1, false)).toStrictEqual({
      sort: [{ column: 1, isDescending: false }],
      filters: VIEW.filters,
    })
    expect(sortedBy(VIEW, 2, true)).toStrictEqual({
      sort: [{ column: 2, isDescending: true }],
      filters: VIEW.filters,
    })
  })

  it('should stop sorting by one column, keeping the others and the filters', () => {
    expect(withoutSort(VIEW, 2)).toStrictEqual({
      sort: [{ column: 0, isDescending: false }],
      filters: VIEW.filters,
    })
    expect(withoutSort(VIEW, 1)).toStrictEqual(VIEW)
  })
})
