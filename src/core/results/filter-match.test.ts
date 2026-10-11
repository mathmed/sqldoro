import { describe, expect, it } from 'vitest'

import { type CellValue, ColumnKind } from '../engine/query.ts'
import { FilterOperator } from './conditions.ts'
import { matchesFilter } from './filter-match.ts'

function matches(
  value: CellValue,
  [operator, ...values]: readonly [FilterOperator, ...string[]],
  kind: ColumnKind = ColumnKind.Text,
): boolean {
  return matchesFilter(value, { column: 0, operator, values }, kind)
}

describe('matchesFilter', () => {
  it('should let NULL meet only "is null"', () => {
    expect(matches(null, [FilterOperator.IsNull])).toBe(true)
    expect(matches(null, [FilterOperator.IsNotNull])).toBe(false)
    expect(matches(null, [FilterOperator.NotEquals, 'x'])).toBe(false)
    expect(matches(null, [FilterOperator.NotContains, 'x'])).toBe(false)
    expect(matches('', [FilterOperator.IsNull])).toBe(false)
    expect(matches('', [FilterOperator.IsNotNull])).toBe(true)
  })

  it('should search text without case', () => {
    expect(matches('Banana', [FilterOperator.Contains, 'NAN'])).toBe(true)
    expect(matches('Banana', [FilterOperator.Contains, 'x'])).toBe(false)
    expect(matches('Banana', [FilterOperator.NotContains, 'NAN'])).toBe(false)
    expect(matches('Banana', [FilterOperator.NotContains, 'x'])).toBe(true)
    expect(matches('Banana', [FilterOperator.StartsWith, 'bA'])).toBe(true)
    expect(matches('Banana', [FilterOperator.StartsWith, 'an'])).toBe(false)
    expect(matches('Banana', [FilterOperator.EndsWith, 'NA'])).toBe(true)
    expect(matches('Banana', [FilterOperator.EndsWith, 'ban'])).toBe(false)
    expect(matches(123, [FilterOperator.Contains, '23'])).toBe(true)
  })

  it('should compare text exactly', () => {
    expect(matches('apple', [FilterOperator.Equals, 'apple'])).toBe(true)
    expect(matches('apple', [FilterOperator.Equals, 'Apple'])).toBe(false)
    expect(matches('apple', [FilterOperator.NotEquals, 'Apple'])).toBe(true)
    expect(matches('apple', [FilterOperator.NotEquals, 'apple'])).toBe(false)
    expect(matches('b', [FilterOperator.InList, 'a', 'b'])).toBe(true)
    expect(matches('c', [FilterOperator.InList, 'a', 'b'])).toBe(false)
  })

  it('should compare exact numbers by value', () => {
    const big = '9007199254740993'

    expect(matches(big, [FilterOperator.Equals, '9007199254740993'], ColumnKind.Number)).toBe(true)
    expect(matches(big, [FilterOperator.Equals, '9007199254740992'], ColumnKind.Number)).toBe(false)
    expect(matches('1.50', [FilterOperator.Equals, ' 1.5 '], ColumnKind.Number)).toBe(true)
    expect(matches('10', [FilterOperator.Greater, '9'], ColumnKind.Number)).toBe(true)
    expect(matches('10', [FilterOperator.Less, '9'], ColumnKind.Number)).toBe(false)
    expect(matches(5, [FilterOperator.LessOrEqual, '5'], ColumnKind.Number)).toBe(true)
    expect(matches(5, [FilterOperator.LessOrEqual, '4'], ColumnKind.Number)).toBe(false)
    expect(matches(5, [FilterOperator.GreaterOrEqual, '5'], ColumnKind.Number)).toBe(true)
    expect(matches(5, [FilterOperator.GreaterOrEqual, '6'], ColumnKind.Number)).toBe(false)
    expect(matches(5, [FilterOperator.Less, '6'], ColumnKind.Number)).toBe(true)
    expect(matches(5, [FilterOperator.Greater, '5'], ColumnKind.Number)).toBe(false)
    expect(matches(5, [FilterOperator.Equals, '5'], ColumnKind.Text)).toBe(true)
  })

  it('should keep the values of a range, both ends included', () => {
    expect(matches('5', [FilterOperator.Between, '5', '10'], ColumnKind.Number)).toBe(true)
    expect(matches('10', [FilterOperator.Between, '5', '10'], ColumnKind.Number)).toBe(true)
    expect(matches('4', [FilterOperator.Between, '5', '10'], ColumnKind.Number)).toBe(false)
    expect(matches('11', [FilterOperator.Between, '5', '10'], ColumnKind.Number)).toBe(false)
  })

  it('should compare dates as the server wrote them', () => {
    const date = '2024-03-15 10:00:00'

    expect(matches(date, [FilterOperator.Greater, '2024-03-01'], ColumnKind.Temporal)).toBe(true)
    expect(matches(date, [FilterOperator.Less, '2024-03-01'], ColumnKind.Temporal)).toBe(false)
    expect(
      matches(date, [FilterOperator.Between, '2024-01-01', '2024-12-31'], ColumnKind.Temporal),
    ).toBe(true)
  })

  it('should read booleans as PostgreSQL does', () => {
    for (const word of ['true', 'TRUE', 'T', '1', 'yes', 'y', ' on ']) {
      expect(matches(true, [FilterOperator.Equals, word], ColumnKind.Boolean)).toBe(true)
    }
    for (const word of ['false', 'False', 'f', '0', 'no', 'n', 'off']) {
      expect(matches(false, [FilterOperator.Equals, word], ColumnKind.Boolean)).toBe(true)
      expect(matches(true, [FilterOperator.Equals, word], ColumnKind.Boolean)).toBe(false)
    }
    expect(matches(true, [FilterOperator.Equals, 'maybe'], ColumnKind.Boolean)).toBe(false)
    expect(matches(true, [FilterOperator.NotEquals, 'false'], ColumnKind.Boolean)).toBe(true)
  })

  it('should match nothing for an operator it does not know', () => {
    expect(
      matchesFilter('a', { column: 0, operator: 'like' as never, values: ['a'] }, ColumnKind.Text),
    ).toBe(false)
  })

  it('should read a value not given as the empty text', () => {
    expect(
      matchesFilter(
        'abc',
        { column: 0, operator: FilterOperator.Contains, values: [] },
        ColumnKind.Text,
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        '',
        { column: 0, operator: FilterOperator.Between, values: [] },
        ColumnKind.Text,
      ),
    ).toBe(true)
  })
})
