import { describe, expect, it } from 'vitest'

import { RESULT_COLUMNS } from '../../../test/fixtures/results.ts'
import { distinctValues, projectRows } from './result-rows.ts'

describe('projectRows', () => {
  it('should keep the columns asked for, in their order', () => {
    expect(
      projectRows(RESULT_COLUMNS, {
        rows: [
          [1, 'a'],
          [2, 'b'],
        ],
        positions: [1, 0, 1],
      }),
    ).toStrictEqual({
      columns: [RESULT_COLUMNS[1], RESULT_COLUMNS[0], RESULT_COLUMNS[1]],
      rows: [
        ['a', 1, 'a'],
        ['b', 2, 'b'],
      ],
    })
  })

  it('should leave out positions that are not columns, and read a short row as NULL', () => {
    expect(projectRows(RESULT_COLUMNS, { rows: [[1]], positions: [-1, 1, 2] })).toStrictEqual({
      columns: [RESULT_COLUMNS[1]],
      rows: [[null]],
    })
  })
})

describe('distinctValues', () => {
  const rows = [['10'], ['9'], [null], ['9'], [true], ['apple']]

  it('should give each value once, in natural order, without NULL', () => {
    expect(distinctValues(rows, 0, 10)).toStrictEqual({
      values: ['9', '10', 'apple', 'true'],
      isComplete: true,
    })
  })

  it('should keep the first ones of a list too long', () => {
    expect(distinctValues(rows, 0, 2)).toStrictEqual({ values: ['9', '10'], isComplete: false })
    expect(distinctValues(rows, 0, 4).isComplete).toBe(true)
  })

  it('should give nothing for a column the rows do not have', () => {
    expect(distinctValues(rows, 3, 10)).toStrictEqual({ values: [], isComplete: true })
  })
})
