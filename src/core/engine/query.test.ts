import { describe, expect, it, vi } from 'vitest'

import {
  ColumnKind,
  isColumnKind,
  QueryCancelledError,
  type ResultColumn,
  type Row,
  RowCollector,
  toCellValue,
} from './query.ts'

const N: ResultColumn = { name: 'n', dataType: 'INT', kind: ColumnKind.Number }

interface Collected {
  readonly sut: RowCollector
  readonly batches: Row[][]
  readonly described: (readonly ResultColumn[])[]
}

function collector(maxRows: number, batchSize: number): Collected {
  const batches: Row[][] = []
  const described: (readonly ResultColumn[])[] = []
  const sut = new RowCollector(
    {
      maxRows,
      onColumns: (columns) => described.push(columns),
      onRows: (rows) => batches.push([...rows]),
    },
    batchSize,
  )
  return { sut, batches, described }
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

describe('isColumnKind', () => {
  it('should accept the known kinds only', () => {
    expect(Object.values(ColumnKind).every(isColumnKind)).toBe(true)
    expect(isColumnKind('date')).toBe(false)
    expect(isColumnKind(1)).toBe(false)
  })
})

describe('QueryCancelledError', () => {
  it('should explain that the query was cancelled', () => {
    const sut = new QueryCancelledError({ hasClosedConnection: false })

    expect(sut).toBeInstanceOf(Error)
    expect(sut.name).toBe('QueryCancelledError')
    expect(sut.message).toBe('The query was cancelled')
    expect(sut.hasClosedConnection).toBe(false)
  })

  it('should say when sqldoro closed the connection of the query to end it', () => {
    const sut = new QueryCancelledError({ hasClosedConnection: true })

    expect(sut.message).toBe('The query was cancelled: sqldoro closed its connection')
    expect(sut.hasClosedConnection).toBe(true)
  })
})

describe('RowCollector', () => {
  it('should hand the rows in batches of the given size', () => {
    const { sut, batches } = collector(10, 2)

    for (const value of [1, 2, 3]) {
      sut.add([value])
    }

    expect(batches).toStrictEqual([[[1], [2]]])
    expect(sut.finish(undefined).rows).toStrictEqual([[1], [2], [3]])
    expect(batches).toStrictEqual([[[1], [2]], [[3]]])
  })

  it('should keep at most maxRows rows and flag the result as truncated', () => {
    const { sut, batches } = collector(2, 5)

    for (const value of [1, 2, 3, 4]) {
      sut.add([value])
    }
    sut.describe([N])
    const result = sut.finish(4)

    expect(result).toStrictEqual({
      columns: [N],
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

    expect(sut.finish(undefined).isTruncated).toBe(false)
  })

  it('should count the rows it can still keep', () => {
    const { sut } = collector(3, 5)

    sut.add([1])

    expect(sut.remaining).toBe(2)
  })

  it('should flag the result as truncated when told so', () => {
    const { sut } = collector(1, 1)

    sut.markTruncated()

    expect(sut.finish(undefined).isTruncated).toBe(true)
  })

  it('should not call onRows when there is nothing to flush', () => {
    const onRows = vi.fn()
    const sut = new RowCollector({ maxRows: 5, onColumns: vi.fn(), onRows }, 2)

    sut.flush()
    sut.finish(undefined)

    expect(onRows).not.toHaveBeenCalled()
  })

  it('should hand the first description of the columns once, before the rows', () => {
    const { sut, described } = collector(5, 1)
    const other: ResultColumn = { name: 'x', dataType: 'TEXT', kind: ColumnKind.Text }

    sut.describe([N])
    sut.describe([other])

    expect(described).toStrictEqual([[N]])
    expect(sut.finish(undefined).columns).toStrictEqual([N])
  })

  it('should describe a result without columns when it finishes undescribed', () => {
    const { sut, described } = collector(5, 1)

    expect(sut.finish(1).columns).toStrictEqual([])
    expect(described).toStrictEqual([[]])
  })

  it('should keep no row when maxRows is zero', () => {
    const { sut, batches } = collector(0, 1)

    sut.add([1])

    expect(sut.finish(undefined)).toMatchObject({ rows: [], isTruncated: true })
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
    expect(
      () => new RowCollector({ maxRows, onColumns: vi.fn(), onRows: vi.fn() }, batchSize),
    ).toThrow(
      new RangeError('maxRows and the batch size must be whole numbers, the batch size above 0'),
    )
  })
})
