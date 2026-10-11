import { describe, expect, it } from 'vitest'

import { ColumnKind } from '../engine/query.ts'
import {
  defaultOperator,
  describeFilter,
  FilterOperator,
  isAppliedDraft,
  isCompleteFilter,
  isFilterOperator,
  isTextSearch,
  operatorLabel,
  operatorsFor,
  valueRange,
  withOperator,
} from './conditions.ts'

describe('isFilterOperator', () => {
  it('should know every operator and nothing else', () => {
    for (const operator of Object.values(FilterOperator)) {
      expect(isFilterOperator(operator)).toBe(true)
    }
    expect(isFilterOperator('like')).toBe(false)
    expect(isFilterOperator(1)).toBe(false)
  })
})

describe('operatorLabel', () => {
  it('should read each operator as people write it', () => {
    expect(Object.values(FilterOperator).map(operatorLabel)).toStrictEqual([
      '=',
      '≠',
      'contains',
      'does not contain',
      'starts with',
      'ends with',
      '<',
      '≤',
      '>',
      '≥',
      'between',
      'in',
      'is null',
      'is not null',
    ])
  })

  it('should show an operator it does not know as it is', () => {
    expect(operatorLabel('like' as FilterOperator)).toBe('like')
  })
})

describe('operatorsFor', () => {
  const EVERY_KIND = [FilterOperator.Equals, FilterOperator.NotEquals]
  const LAST = [FilterOperator.InList, FilterOperator.IsNull, FilterOperator.IsNotNull]

  it('should offer text searches for text', () => {
    expect(operatorsFor(ColumnKind.Text, false)).toStrictEqual([
      ...EVERY_KIND,
      FilterOperator.Contains,
      FilterOperator.NotContains,
      FilterOperator.StartsWith,
      FilterOperator.EndsWith,
      ...LAST,
    ])
    expect(operatorsFor(ColumnKind.Json, false)).toContain(FilterOperator.Contains)
    expect(operatorsFor(ColumnKind.Other, false)).toContain(FilterOperator.EndsWith)
  })

  it('should offer ranges for numbers and dates', () => {
    const ranges = [
      ...EVERY_KIND,
      FilterOperator.Less,
      FilterOperator.LessOrEqual,
      FilterOperator.Greater,
      FilterOperator.GreaterOrEqual,
      FilterOperator.Between,
      ...LAST,
    ]

    expect(operatorsFor(ColumnKind.Number, false)).toStrictEqual(ranges)
    expect(operatorsFor(ColumnKind.Temporal, false)).toStrictEqual(ranges)
  })

  it('should offer equality, lists and NULL for booleans and enums', () => {
    expect(operatorsFor(ColumnKind.Boolean, false)).toStrictEqual([...EVERY_KIND, ...LAST])
    expect(operatorsFor(ColumnKind.Text, true)).toStrictEqual([...EVERY_KIND, ...LAST])
    expect(operatorsFor(ColumnKind.Number, true)).toStrictEqual([...EVERY_KIND, ...LAST])
  })
})

describe('defaultOperator', () => {
  it('should start text on contains, enums on a list and the rest on equality', () => {
    expect(defaultOperator(ColumnKind.Text, false)).toBe(FilterOperator.Contains)
    expect(defaultOperator(ColumnKind.Text, true)).toBe(FilterOperator.InList)
    expect(defaultOperator(ColumnKind.Number, false)).toBe(FilterOperator.Equals)
    expect(defaultOperator(ColumnKind.Boolean, false)).toBe(FilterOperator.Equals)
  })
})

describe('valueRange and isCompleteFilter', () => {
  it('should say how many values each operator takes', () => {
    expect(valueRange(FilterOperator.IsNull)).toStrictEqual({ min: 0, max: 0 })
    expect(valueRange(FilterOperator.IsNotNull)).toStrictEqual({ min: 0, max: 0 })
    expect(valueRange(FilterOperator.Equals)).toStrictEqual({ min: 1, max: 1 })
    expect(valueRange(FilterOperator.Between)).toStrictEqual({ min: 2, max: 2 })
    expect(valueRange(FilterOperator.InList)).toStrictEqual({
      min: 1,
      max: Number.POSITIVE_INFINITY,
    })
  })

  it('should apply a filter once it has its values', () => {
    expect(isCompleteFilter({ operator: FilterOperator.IsNull, values: [] })).toBe(true)
    expect(isCompleteFilter({ operator: FilterOperator.IsNull, values: ['x'] })).toBe(false)
    expect(isCompleteFilter({ operator: FilterOperator.Equals, values: [''] })).toBe(true)
    expect(isCompleteFilter({ operator: FilterOperator.Equals, values: [] })).toBe(false)
    expect(isCompleteFilter({ operator: FilterOperator.Equals, values: ['a', 'b'] })).toBe(false)
    expect(isCompleteFilter({ operator: FilterOperator.Between, values: ['1'] })).toBe(false)
    expect(isCompleteFilter({ operator: FilterOperator.Between, values: ['1', '2'] })).toBe(true)
    expect(isCompleteFilter({ operator: FilterOperator.InList, values: [] })).toBe(false)
    expect(isCompleteFilter({ operator: FilterOperator.InList, values: ['a', 'b', 'c'] })).toBe(
      true,
    )
  })

  it('should not search for an empty text', () => {
    expect(isCompleteFilter({ operator: FilterOperator.Contains, values: [''] })).toBe(false)
    expect(isCompleteFilter({ operator: FilterOperator.StartsWith, values: ['a'] })).toBe(true)
  })
})

describe('isTextSearch', () => {
  it('should tell the text searches apart', () => {
    expect(isTextSearch(FilterOperator.NotContains)).toBe(true)
    expect(isTextSearch(FilterOperator.Equals)).toBe(false)
  })
})

describe('describeFilter', () => {
  it('should read a filter as people write it', () => {
    expect(describeFilter({ operator: FilterOperator.Equals, values: ['a'] })).toBe("= 'a'")
    expect(describeFilter({ operator: FilterOperator.IsNull, values: [] })).toBe('is null')
    expect(describeFilter({ operator: FilterOperator.Between, values: ['1', '5'] })).toBe(
      "between '1' and '5'",
    )
    expect(describeFilter({ operator: FilterOperator.InList, values: ['a', 'b'] })).toBe(
      "in ('a', 'b')",
    )
  })
})

describe('isAppliedDraft', () => {
  it('should apply a condition with its values', () => {
    expect(
      isAppliedDraft({ operator: FilterOperator.Less, values: ['5'] }, ColumnKind.Number),
    ).toBe(true)
    expect(isAppliedDraft({ operator: FilterOperator.IsNull, values: [] }, ColumnKind.Number)).toBe(
      true,
    )
  })

  it('should not apply a condition without its values', () => {
    expect(
      isAppliedDraft({ operator: FilterOperator.Between, values: ['1'] }, ColumnKind.Number),
    ).toBe(false)
    expect(isAppliedDraft({ operator: FilterOperator.InList, values: [] }, ColumnKind.Text)).toBe(
      false,
    )
  })

  it('should take an empty value only as the empty text of a text column, compared or listed', () => {
    expect(isAppliedDraft({ operator: FilterOperator.Equals, values: [''] }, ColumnKind.Text)).toBe(
      true,
    )
    expect(
      isAppliedDraft({ operator: FilterOperator.NotEquals, values: [''] }, ColumnKind.Text),
    ).toBe(true)
    expect(
      isAppliedDraft({ operator: FilterOperator.Equals, values: [''] }, ColumnKind.Number),
    ).toBe(false)
    expect(isAppliedDraft({ operator: FilterOperator.Less, values: [''] }, ColumnKind.Text)).toBe(
      false,
    )
    expect(
      isAppliedDraft({ operator: FilterOperator.InList, values: ['a', ''] }, ColumnKind.Text),
    ).toBe(true)
    expect(
      isAppliedDraft({ operator: FilterOperator.InList, values: [''] }, ColumnKind.Number),
    ).toBe(false)
  })
})

describe('withOperator', () => {
  it('should keep the values the new operator takes', () => {
    const sut = withOperator(
      { operator: FilterOperator.Equals, values: ['3'] },
      FilterOperator.Between,
    )

    expect(sut).toStrictEqual({ operator: FilterOperator.Between, values: ['3', ''] })
  })

  it('should drop the values the new operator does not take', () => {
    const between = { operator: FilterOperator.Between, values: ['1', '5'] }

    expect(withOperator(between, FilterOperator.Less)).toStrictEqual({
      operator: FilterOperator.Less,
      values: ['1'],
    })
    expect(withOperator(between, FilterOperator.IsNull)).toStrictEqual({
      operator: FilterOperator.IsNull,
      values: [],
    })
  })

  it('should keep every value of a list given for a list', () => {
    const sut = withOperator(
      { operator: FilterOperator.InList, values: ['a', '', 'b'] },
      FilterOperator.InList,
    )

    expect(sut).toStrictEqual({ operator: FilterOperator.InList, values: ['a', 'b'] })
  })

  it('should keep the values given for a list, without the empty ones', () => {
    const sut = withOperator(
      { operator: FilterOperator.Between, values: ['1', ''] },
      FilterOperator.InList,
    )

    expect(sut).toStrictEqual({ operator: FilterOperator.InList, values: ['1'] })
  })
})
