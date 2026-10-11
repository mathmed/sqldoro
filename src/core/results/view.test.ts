import { describe, expect, it } from 'vitest'

import { ColumnKind, type ResultColumn, type Row } from '../engine/query.ts'
import { type ColumnFilter, FilterOperator } from './conditions.ts'
import { activeFilters, applyView, IDENTITY_VIEW, isIdentityView, searchRows } from './view.ts'

const COLUMNS: readonly ResultColumn[] = [
  { name: 'id', dataType: 'INT8', kind: ColumnKind.Number },
  { name: 'name', dataType: 'TEXT', kind: ColumnKind.Text },
  { name: 'active', dataType: 'BOOL', kind: ColumnKind.Boolean },
]
const ROWS: readonly Row[] = [
  ['10', 'banana', true],
  ['9', 'Apple', false],
  [null, 'cherry', null],
  ['100', null, true],
  ['9', 'apple 2', true],
]

function contains(column: number, text: string): ColumnFilter {
  return { column, operator: FilterOperator.Contains, values: [text] }
}

describe('isIdentityView and activeFilters', () => {
  it('should see a view without sort and with incomplete filters as the identity', () => {
    expect(isIdentityView(IDENTITY_VIEW)).toBe(true)
    expect(isIdentityView({ sort: [], filters: [contains(0, '')] })).toBe(true)
    expect(isIdentityView({ sort: [{ column: 0, isDescending: false }], filters: [] })).toBe(false)
    expect(isIdentityView({ sort: [], filters: [contains(0, 'a')] })).toBe(false)
  })

  it('should keep the filters that have their values', () => {
    expect(
      activeFilters({
        sort: [],
        filters: [contains(0, ''), contains(1, 'x')],
      }),
    ).toStrictEqual([contains(1, 'x')])
  })
})

describe('applyView', () => {
  it('should keep every row in order for the identity view', () => {
    expect(applyView(ROWS, COLUMNS, IDENTITY_VIEW)).toStrictEqual([0, 1, 2, 3, 4])
  })

  it('should keep the rows that match every filter', () => {
    const view = {
      sort: [],
      filters: [
        contains(1, 'APP'),
        { column: 2, operator: FilterOperator.Equals, values: ['true'] },
      ],
    }

    expect(applyView(ROWS, COLUMNS, view)).toStrictEqual([4])
  })

  it('should keep the rows that meet every filter of the same column', () => {
    const view = {
      sort: [],
      filters: [
        { column: 0, operator: FilterOperator.GreaterOrEqual, values: ['9'] },
        { column: 0, operator: FilterOperator.Less, values: ['100'] },
      ],
    }

    expect(applyView(ROWS, COLUMNS, view)).toStrictEqual([0, 1, 4])
  })

  it('should match nothing for a filter on a column that does not exist', () => {
    expect(applyView(ROWS, COLUMNS, { sort: [], filters: [contains(9, 'a')] })).toStrictEqual([])
  })

  it('should sort exact numbers by value, NULLs last, equal rows in their order', () => {
    expect(
      applyView(ROWS, COLUMNS, { sort: [{ column: 0, isDescending: false }], filters: [] }),
    ).toStrictEqual([1, 4, 0, 3, 2])
  })

  it('should sort in descending order with NULLs still last', () => {
    expect(
      applyView(ROWS, COLUMNS, { sort: [{ column: 0, isDescending: true }], filters: [] }),
    ).toStrictEqual([3, 0, 1, 4, 2])
  })

  it('should sort text in natural order, NULLs last', () => {
    expect(
      applyView(ROWS, COLUMNS, { sort: [{ column: 1, isDescending: false }], filters: [] }),
    ).toStrictEqual([1, 4, 0, 2, 3])
  })

  it('should sort by the next key when the first one is equal', () => {
    const view = {
      sort: [
        { column: 0, isDescending: false },
        { column: 1, isDescending: true },
      ],
      filters: [],
    }

    expect(applyView(ROWS, COLUMNS, view)).toStrictEqual([4, 1, 0, 3, 2])
  })

  it('should sort booleans and numbers given as numbers', () => {
    const rows: readonly Row[] = [
      [2, true],
      [10, false],
      [1, true],
    ]
    const columns: readonly ResultColumn[] = [
      { name: 'n', dataType: 'INT4', kind: ColumnKind.Number },
      { name: 'b', dataType: 'BOOL', kind: ColumnKind.Boolean },
    ]

    expect(
      applyView(rows, columns, { sort: [{ column: 0, isDescending: false }], filters: [] }),
    ).toStrictEqual([2, 0, 1])
    expect(
      applyView(rows, columns, { sort: [{ column: 1, isDescending: false }], filters: [] }),
    ).toStrictEqual([1, 0, 2])
  })

  it('should sort numbers by value and other columns by their text', () => {
    const rows: readonly Row[] = [['1.5'], ['1.10']]
    const sortFirst = { sort: [{ column: 0, isDescending: false }], filters: [] }

    expect(
      applyView(rows, [{ name: 'n', dataType: 'X', kind: ColumnKind.Number }], sortFirst),
    ).toStrictEqual([1, 0])
    expect(
      applyView(rows, [{ name: 'n', dataType: 'X', kind: ColumnKind.Text }], sortFirst),
    ).toStrictEqual([0, 1])
    expect(applyView(rows, [], sortFirst)).toStrictEqual([0, 1])
  })

  it('should compare a boolean in a number column as text', () => {
    const rows: readonly Row[] = [[true], ['5']]
    const columns: readonly ResultColumn[] = [{ name: 'n', dataType: 'X', kind: ColumnKind.Number }]

    expect(
      applyView(rows, columns, { sort: [{ column: 0, isDescending: false }], filters: [] }),
    ).toStrictEqual([1, 0])
  })

  it('should keep every row in order when sorting by a column that does not exist', () => {
    expect(
      applyView(ROWS, COLUMNS, { sort: [{ column: 7, isDescending: false }], filters: [] }),
    ).toStrictEqual([0, 1, 2, 3, 4])
  })
})

describe('searchRows', () => {
  it('should keep every row with the text in any column, without case, in order', () => {
    expect(searchRows(ROWS, undefined, 'APP')).toStrictEqual([1, 4])
    expect(searchRows(ROWS, undefined, '10')).toStrictEqual([0, 3])
    expect(searchRows(ROWS, undefined, 'ru')).toStrictEqual([0, 3, 4])
  })

  it('should search the rows a view shows, in the order of the view', () => {
    expect(searchRows(ROWS, [4, 2, 1, 0], 'a')).toStrictEqual([4, 1, 0])
    expect(searchRows(ROWS, [], 'a')).toStrictEqual([])
  })

  it('should never match NULL, even with its name', () => {
    expect(searchRows(ROWS, undefined, 'null')).toStrictEqual([])
  })

  it('should keep no row when nothing holds the text', () => {
    expect(searchRows(ROWS, undefined, 'kiwi')).toStrictEqual([])
  })
})
