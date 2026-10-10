import { describe, expect, it, vi } from 'vitest'

import { QueryCancelledError, type Row, RowCollector, toCellValue } from './query.ts'

const NO_COLUMNS = [] as const

function collector(maxRows: number, batchSize: number): { sut: RowCollector; batches: Row[][] } {
  const batches: Row[][] = []
  const sut = new RowCollector({ maxRows, onRows: (rows) => batches.push([...rows]) }, batchSize)
  return { sut, batches }
}

describe('toCellValue', () => {
  it.each([
    { kind: 'a string', value: 'text', expected: 'text' },
    { kind: 'a number', value: 1.5, expected: 1.5 },
    { kind: 'a boolean', value: false, expected: false },
    { kind: 'null', value: null, expected: null },
    { kind: 'undefined', value: undefined, expected: null },
  ])('should keep $kind as a cell value', ({ value, expected }) => {
    expect(toCellValue(value)).toBe(expected)
  })

  it('should show bytes as hexadecimal text', () => {
    expect(toCellValue(Uint8Array.of(0, 15, 255))).toBe('0x000fff')
  })

  it('should show empty bytes as an empty hexadecimal value', () => {
    expect(toCellValue(new Uint8Array())).toBe('0x')
  })

  it('should keep the digits of a bigint', () => {
    expect(toCellValue(9_007_199_254_740_993n)).toBe('9007199254740993')
  })

  it('should show objects and arrays as JSON', () => {
    expect(toCellValue({ a: [1, 'b'] })).toBe('{"a":[1,"b"]}')
    expect(toCellValue([1, null])).toBe('[1,null]')
  })
})

describe('QueryCancelledError', () => {
  it('should explain that the query was cancelled', () => {
    const sut = new QueryCancelledError()

    expect(sut).toBeInstanceOf(Error)
    expect(sut.name).toBe('QueryCancelledError')
    expect(sut.message).toBe('The query was cancelled')
  })
})

describe('RowCollector', () => {
  it('should hand the rows in batches of the given size', () => {
    const { sut, batches } = collector(10, 2)

    for (const value of [1, 2, 3]) {
      sut.add([value])
    }

    expect(batches).toStrictEqual([[[1], [2]]])
    expect(sut.finish(NO_COLUMNS, undefined).rows).toStrictEqual([[1], [2], [3]])
    expect(batches).toStrictEqual([[[1], [2]], [[3]]])
  })

  it('should keep at most maxRows rows and flag the result as truncated', () => {
    const { sut, batches } = collector(2, 5)

    for (const value of [1, 2, 3, 4]) {
      sut.add([value])
    }
    const result = sut.finish([{ name: 'n', dataType: 'INT' }], 4)

    expect(result).toStrictEqual({
      columns: [{ name: 'n', dataType: 'INT' }],
      rows: [[1], [2]],
      isTruncated: true,
      affectedRows: 4,
    })
    expect(batches).toStrictEqual([[[1], [2]]])
  })

  it('should not flag a result that fills maxRows exactly', () => {
    const { sut } = collector(2, 5)

    sut.add([1])
    sut.add([2])

    expect(sut.finish(NO_COLUMNS, undefined).isTruncated).toBe(false)
  })

  it('should count the rows it can still keep', () => {
    const { sut } = collector(3, 5)

    sut.add([1])

    expect(sut.remaining).toBe(2)
  })

  it('should flag the result as truncated when told so', () => {
    const { sut } = collector(1, 1)

    sut.markTruncated()

    expect(sut.finish(NO_COLUMNS, undefined).isTruncated).toBe(true)
  })

  it('should not call onRows when there is nothing to flush', () => {
    const onRows = vi.fn()
    const sut = new RowCollector({ maxRows: 5, onRows }, 2)

    sut.flush()
    sut.finish(NO_COLUMNS, undefined)

    expect(onRows).not.toHaveBeenCalled()
  })

  it('should keep no row when maxRows is zero', () => {
    const { sut, batches } = collector(0, 1)

    sut.add([1])

    expect(sut.finish(NO_COLUMNS, undefined)).toMatchObject({ rows: [], isTruncated: true })
    expect(batches).toStrictEqual([])
  })

  it.each([
    { problem: 'a negative maxRows', maxRows: -1, batchSize: 1 },
    { problem: 'a fractional maxRows', maxRows: 1.5, batchSize: 1 },
    { problem: 'an unsafe maxRows', maxRows: Number.MAX_SAFE_INTEGER + 1, batchSize: 1 },
    { problem: 'a zero batch size', maxRows: 1, batchSize: 0 },
    { problem: 'a negative batch size', maxRows: 1, batchSize: -1 },
    { problem: 'a fractional batch size', maxRows: 1, batchSize: 0.5 },
  ])('should reject $problem', ({ maxRows, batchSize }) => {
    expect(() => new RowCollector({ maxRows, onRows: vi.fn() }, batchSize)).toThrow(
      new RangeError('maxRows and the batch size must be whole numbers, the batch size above 0'),
    )
  })
})
