import { describe, expect, it } from 'vitest'

import {
  filtersOf,
  filterText,
  sortedBy,
  sortingOf,
  viewOf,
  withFilter,
  withoutSort,
} from './view-state.ts'

const VIEW = {
  sort: [
    { column: 2, isDescending: true },
    { column: 0, isDescending: false },
  ],
  filters: [{ column: 1, text: 'ab' }],
}

describe('view state', () => {
  it('should write a view as column ids', () => {
    expect(sortingOf(VIEW)).toStrictEqual([
      { id: '2', isDescending: true },
      { id: '0', isDescending: false },
    ])
    expect(filtersOf(VIEW)).toStrictEqual([{ id: '1', value: 'ab' }])
  })

  it('should read the view back', () => {
    expect(viewOf(sortingOf(VIEW), filtersOf(VIEW))).toStrictEqual(VIEW)
  })

  it('should leave out what is not a column position or a text filter', () => {
    expect(
      viewOf(
        [
          { id: 'x', isDescending: true },
          { id: '1a', isDescending: false },
          { id: 'a1', isDescending: false },
          { id: '3', isDescending: false },
          { id: '12', isDescending: true },
        ],
        [
          { id: '1', value: 5 },
          { id: 'y', value: 'a' },
          { id: '4', value: '' },
        ],
      ),
    ).toStrictEqual({
      sort: [
        { column: 3, isDescending: false },
        { column: 12, isDescending: true },
      ],
      filters: [{ column: 4, text: '' }],
    })
  })
})

describe('withFilter and filterText', () => {
  it('should set, replace and remove the filter of a column, keeping the sort', () => {
    const added = withFilter(VIEW, 3, 'x')
    const replaced = withFilter(added, 1, 'cd')
    const removed = withFilter(replaced, 3, '')

    expect(added).toStrictEqual({
      sort: VIEW.sort,
      filters: [
        { column: 1, text: 'ab' },
        { column: 3, text: 'x' },
      ],
    })
    expect(replaced.filters).toStrictEqual([
      { column: 3, text: 'x' },
      { column: 1, text: 'cd' },
    ])
    expect(removed).toStrictEqual({ sort: VIEW.sort, filters: [{ column: 1, text: 'cd' }] })
  })

  it('should read the filter of a column, empty without one', () => {
    expect(filterText(VIEW, 1)).toBe('ab')
    expect(filterText(VIEW, 0)).toBe('')
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
