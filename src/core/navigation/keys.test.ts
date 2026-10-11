import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { literalBinder, parameterBinder } from '../results/binders.ts'
import { keyConditions, type KeyMatch, keyText } from './keys.ts'

const ROW: KeyMatch = {
  parts: [
    { column: 'id', value: '9007199254740993' },
    { column: 'Region', value: 'south' },
  ],
  isRowKey: true,
}

describe('keyConditions', () => {
  it('should compare each column with a bound value, cast where the catalog says', () => {
    const binder = parameterBinder(MYSQL_DIALECT, 0)

    expect(
      keyConditions(ROW, {
        dialect: MYSQL_DIALECT,
        binder,
        parameterTypes: new Map([['id', 'SIGNED']]),
      }),
    ).toStrictEqual(['`id` = CAST(? AS SIGNED)', '`Region` = ?'])
    expect(binder.values()).toStrictEqual(['9007199254740993', 'south'])
  })

  it('should write the values in for an editor', () => {
    expect(
      keyConditions(ROW, {
        dialect: POSTGRES_DIALECT,
        binder: literalBinder(POSTGRES_DIALECT),
        parameterTypes: new Map([['id', 'int8']]),
      }),
    ).toStrictEqual(['"id" = 9007199254740993', `"Region" = 'south'`])
  })
})

describe('keyText', () => {
  it('should name a row by its key', () => {
    expect(keyText(ROW)).toBe('#9007199254740993, south')
    expect(keyText({ parts: [{ column: 'id', value: 1 }], isRowKey: true })).toBe('#1')
  })

  it('should name the rows that reference one by their columns', () => {
    expect(
      keyText({
        parts: [
          { column: 'condominiumId', value: 1 },
          { column: 'code', value: 'A-1' },
          { column: 'total', value: '12.50' },
          { column: 'isActive', value: true },
        ],
        isRowKey: false,
      }),
    ).toBe("(condominiumId = 1, code = 'A-1', total = 12.50, isActive = true)")
  })

  it('should cut long values', () => {
    const long = 'x'.repeat(41)

    expect(keyText({ parts: [{ column: 'a', value: long }], isRowKey: true })).toBe(
      `#${'x'.repeat(39)}…`,
    )
    expect(keyText({ parts: [{ column: 'a', value: 'y'.repeat(40) }], isRowKey: false })).toBe(
      `(a = '${'y'.repeat(40)}')`,
    )
  })
})
