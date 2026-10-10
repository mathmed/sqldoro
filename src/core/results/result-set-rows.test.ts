import { describe, expect, it } from 'vitest'

import { ORDERS_RESULT } from '../../../test/fixtures/tables.ts'
import { NOT_EDITING } from '../edits/tab-editor.ts'
import { ResultSet } from './result-set.ts'

function resultSet(): ResultSet {
  const sut = new ResultSet({
    id: 't',
    sql: 'SELECT * FROM orders',
    kind: 'rows',
    canServerView: true,
  })
  sut.describe(ORDERS_RESULT)
  sut.addRows([[30], [10], [20]])
  return sut
}

describe('ResultSet as the rows its edits read', () => {
  it('should map positions of the view to rows of the result and back', () => {
    const sut = resultSet()

    expect([0, 1, 2, 3].map(sut.sourceIndex)).toStrictEqual([0, 1, 2, undefined])
    expect(sut.viewPositions([3])).toStrictEqual(new Map())
    expect(sut.viewPositions([2, 0, 7])).toStrictEqual(
      new Map([
        [2, 2],
        [0, 0],
      ]),
    )
    sut.applyView({ sort: [{ column: 0, isDescending: false }], filters: [] })
    expect([0, 1, 2, 3].map(sut.sourceIndex)).toStrictEqual([1, 2, 0, undefined])
    expect(sut.viewPositions([0, 1, 9])).toStrictEqual(
      new Map([
        [1, 0],
        [0, 2],
      ]),
    )
    expect(sut.viewPositions([])).toStrictEqual(new Map())
  })

  it('should leave out the rows the filters hide', () => {
    const sut = resultSet()

    sut.applyView({ sort: [], filters: [{ column: 0, text: '0' }] })
    sut.applyView({ sort: [], filters: [{ column: 0, text: '3' }] })

    expect(sut.viewPositions([0, 1, 2])).toStrictEqual(new Map([[0, 0]]))
    expect(sut.sourceIndex(1)).toBeUndefined()
  })

  it('should give the rows of the result as the query returned them', () => {
    const sut = resultSet()

    expect(sut.sourceRow(1)).toStrictEqual([10])
    expect(sut.sourceRow(3)).toBeUndefined()
  })

  it('should keep where the columns come from to itself', () => {
    expect(resultSet().toTab().columns).toStrictEqual(
      ORDERS_RESULT.map(({ name, dataType, kind }) => ({ name, dataType, kind })),
    )
  })

  it('should drop the editing of the old rows when it runs again', () => {
    const sut = resultSet()
    sut.editor.startCheck()

    sut.restart({ sort: [], filters: [] })

    expect(sut.toTab().editing).toBe(NOT_EDITING)
  })
})
