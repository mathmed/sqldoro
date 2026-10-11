import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import type { Dialect } from '../engine/dialect.ts'
import { literalBinder, parameterBinder } from './binders.ts'
import { type ColumnFilter, FilterOperator } from './conditions.ts'
import { filterConditions, type NamedFilter } from './filter-sql.ts'

function written(
  filters: readonly NamedFilter[],
  dialect: Dialect,
  first = 0,
): { readonly conditions: readonly string[]; readonly values: readonly unknown[] } {
  const binder = parameterBinder(dialect, first)
  return { conditions: filterConditions(filters, { dialect, binder }), values: binder.values() }
}

function named(
  operator: FilterOperator,
  values: readonly string[],
  parameterType = '',
): NamedFilter {
  const filter: ColumnFilter = { column: 0, operator, values }
  return { filter, name: 'Col', parameterType }
}

describe('filterConditions', () => {
  it('should compare with bound values, numbered after those before', () => {
    expect(
      written(
        [
          named(FilterOperator.Equals, ['1']),
          named(FilterOperator.NotEquals, ['2']),
          named(FilterOperator.Less, ['3']),
          named(FilterOperator.LessOrEqual, ['4']),
          named(FilterOperator.Greater, ['5']),
          named(FilterOperator.GreaterOrEqual, ['6']),
        ],
        POSTGRES_DIALECT,
        2,
      ),
    ).toStrictEqual({
      conditions: [
        '"Col" = $3',
        '"Col" <> $4',
        '"Col" < $5',
        '"Col" <= $6',
        '"Col" > $7',
        '"Col" >= $8',
      ],
      values: ['1', '2', '3', '4', '5', '6'],
    })
  })

  it('should write ranges, lists and NULL tests', () => {
    expect(
      written(
        [
          named(FilterOperator.Between, ['1', '9']),
          named(FilterOperator.InList, ['a', 'b', 'c']),
          named(FilterOperator.IsNull, []),
          named(FilterOperator.IsNotNull, []),
        ],
        POSTGRES_DIALECT,
      ),
    ).toStrictEqual({
      conditions: [
        '"Col" BETWEEN $1 AND $2',
        '"Col" IN ($3, $4, $5)',
        '"Col" IS NULL',
        '"Col" IS NOT NULL',
      ],
      values: ['1', '9', 'a', 'b', 'c'],
    })
  })

  it('should search text without case, its wildcards searched for', () => {
    expect(
      written(
        [
          named(FilterOperator.Contains, ['50%_Off\\']),
          named(FilterOperator.NotContains, ['X']),
          named(FilterOperator.StartsWith, ['Ab']),
          named(FilterOperator.EndsWith, ['yZ'], 'SIGNED'),
        ],
        MYSQL_DIALECT,
      ),
    ).toStrictEqual({
      conditions: [
        'LOWER(CAST(`Col` AS CHAR)) LIKE ?',
        'LOWER(CAST(`Col` AS CHAR)) NOT LIKE ?',
        'LOWER(CAST(`Col` AS CHAR)) LIKE ?',
        'LOWER(CAST(`Col` AS CHAR)) LIKE ?',
      ],
      values: ['%50\\%\\_off\\\\%', '%x%', 'ab%', '%yz'],
    })
  })

  it('should cast the values the server would not compare exactly', () => {
    expect(
      written(
        [
          named(FilterOperator.Equals, ['9007199254740993'], 'SIGNED'),
          named(FilterOperator.Between, ['1.5', '2.5'], 'DECIMAL(10,2)'),
        ],
        MYSQL_DIALECT,
      ).conditions,
    ).toStrictEqual([
      '`Col` = CAST(? AS SIGNED)',
      '`Col` BETWEEN CAST(? AS DECIMAL(10,2)) AND CAST(? AS DECIMAL(10,2))',
    ])
  })

  it('should write nothing without filters', () => {
    expect(written([], MYSQL_DIALECT)).toStrictEqual({ conditions: [], values: [] })
  })

  it('should write literals for a statement shown to the user', () => {
    const binder = literalBinder(MYSQL_DIALECT)

    expect(
      filterConditions(
        [
          named(FilterOperator.Equals, ['5'], 'SIGNED'),
          named(FilterOperator.Equals, ["it's"]),
          named(FilterOperator.Contains, ['5'], 'SIGNED'),
        ],
        { dialect: MYSQL_DIALECT, binder },
      ),
    ).toStrictEqual(['`Col` = 5', "`Col` = 'it''s'", "LOWER(CAST(`Col` AS CHAR)) LIKE '%5%'"])
    expect(binder.values()).toStrictEqual([])
  })
})
