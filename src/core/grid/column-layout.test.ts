import { describe, expect, it } from 'vitest'

import {
  columnKeys,
  DEFAULT_LAYOUT,
  hiddenCount,
  isDefaultLayout,
  orderedColumns,
  shownColumns,
  withAllHidden,
  withHidden,
  withInverted,
  withMoved,
  withNoneHidden,
} from './column-layout.ts'

const COLUMNS = [{ name: 'id' }, { name: 'name' }, { name: 'id' }, { name: 'total' }]

describe('columnKeys', () => {
  it('should name a column by its name and a repeated one by its occurrence', () => {
    expect(columnKeys(COLUMNS)).toStrictEqual(['id', 'name', 'id#2', 'total'])
    expect(columnKeys([{ name: 'a' }, { name: 'a' }, { name: 'a' }])).toStrictEqual([
      'a',
      'a#2',
      'a#3',
    ])
  })
})

describe('orderedColumns and shownColumns', () => {
  it('should keep the order of the result by default', () => {
    expect(orderedColumns(COLUMNS, DEFAULT_LAYOUT)).toStrictEqual([
      { index: 0, key: 'id' },
      { index: 1, key: 'name' },
      { index: 2, key: 'id#2' },
      { index: 3, key: 'total' },
    ])
    expect(shownColumns(COLUMNS, DEFAULT_LAYOUT)).toStrictEqual([0, 1, 2, 3])
  })

  it('should put the ordered columns first, then the others, without the hidden ones', () => {
    const layout = { order: ['total', 'gone', 'total', 'id#2'], hidden: ['name'] }

    expect(orderedColumns(COLUMNS, layout).map(({ index }) => index)).toStrictEqual([3, 2, 0, 1])
    expect(shownColumns(COLUMNS, layout)).toStrictEqual([3, 2, 0])
    expect(hiddenCount(COLUMNS, layout)).toBe(1)
    expect(hiddenCount(COLUMNS, { order: [], hidden: ['gone'] })).toBe(0)
  })
})

describe('isDefaultLayout', () => {
  it('should tell a layout that changes nothing', () => {
    expect(isDefaultLayout(DEFAULT_LAYOUT)).toBe(true)
    expect(isDefaultLayout({ order: ['a'], hidden: [] })).toBe(false)
    expect(isDefaultLayout({ order: [], hidden: ['a'] })).toBe(false)
  })
})

describe('hiding columns', () => {
  it('should hide and show columns again, keeping the order', () => {
    const layout = { order: ['total'], hidden: ['name'] }
    const hidden = withHidden(layout, ['id', 'name'], true)

    expect(hidden).toStrictEqual({ order: ['total'], hidden: ['id', 'name'] })
    expect(withHidden(hidden, ['name'], false)).toStrictEqual({ order: ['total'], hidden: ['id'] })
  })

  it('should show every column, hide every one and invert', () => {
    const layout = { order: ['total'], hidden: ['name'] }
    const keys = columnKeys(COLUMNS)

    expect(withNoneHidden(layout)).toStrictEqual({ order: ['total'], hidden: [] })
    expect(withAllHidden(keys, layout)).toStrictEqual({ order: ['total'], hidden: keys })
    expect(withInverted(keys, layout)).toStrictEqual({
      order: ['total'],
      hidden: ['id', 'id#2', 'total'],
    })
  })
})

describe('withMoved', () => {
  it('should move a column to a place among every column', () => {
    expect(withMoved(COLUMNS, DEFAULT_LAYOUT, { key: 'total', target: 0 })).toStrictEqual({
      order: ['total', 'id', 'name', 'id#2'],
      hidden: [],
    })
    expect(withMoved(COLUMNS, DEFAULT_LAYOUT, { key: 'id', target: 2 }).order).toStrictEqual([
      'name',
      'id#2',
      'id',
      'total',
    ])
  })

  it('should keep the place inside the columns', () => {
    expect(withMoved(COLUMNS, DEFAULT_LAYOUT, { key: 'id', target: 9 }).order).toStrictEqual([
      'name',
      'id#2',
      'total',
      'id',
    ])
    expect(withMoved(COLUMNS, DEFAULT_LAYOUT, { key: 'total', target: -3 }).order).toStrictEqual([
      'total',
      'id',
      'name',
      'id#2',
    ])
  })

  it('should leave the layout alone for a column that is not there', () => {
    const layout = { order: ['name'], hidden: ['id'] }

    expect(withMoved(COLUMNS, layout, { key: 'gone', target: 0 })).toBe(layout)
  })
})
