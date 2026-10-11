import { type CellValue, isColumnKind, type ResultColumn } from '../engine/query.ts'
import {
  type JsonRecord,
  readArray,
  readBoolean,
  readCount,
  readList,
  readNested,
  readOneOf,
  readString,
  readStrings,
} from '../json/record.ts'
import { type ColumnFilter, isFilterOperator } from './conditions.ts'
import type { CellBlock } from './protocol.ts'
import type { SortKey, ViewSpec } from './view.ts'

const CELL_TYPES: ReadonlySet<string> = new Set(['boolean', 'number', 'string'])

function isCellValue(value: unknown): value is CellValue {
  return value === null || CELL_TYPES.has(typeof value)
}

export function readCellValue(record: JsonRecord, key: string): CellValue {
  const value = record.get(key)
  if (!isCellValue(value)) {
    throw new TypeError(`"${key}" must be a cell value`)
  }
  return value
}

export function readCells(record: JsonRecord, key: string): CellValue[] {
  const values = readArray(record, key)
  if (!values.every(isCellValue)) {
    throw new TypeError(`"${key}" must hold cell values`)
  }
  return [...values]
}

export function readCounts(record: JsonRecord, key: string): number[] {
  return readArray(record, key).map((value, index) =>
    readCount(new Map([[String(index), value]]), String(index)),
  )
}

export function readColumns(record: JsonRecord, key: string): ResultColumn[] {
  return readList(record, key, (column) => ({
    name: readString(column, 'name'),
    dataType: readString(column, 'dataType'),
    kind: readOneOf(column, 'kind', isColumnKind),
  }))
}

export function readViewSpec(record: JsonRecord, key: string): ViewSpec {
  const view = readNested(record, key)
  return {
    sort: readList(view, 'sort', readSortKey),
    filters: readList(view, 'filters', readFilter),
  }
}

function readSortKey(key: JsonRecord): SortKey {
  return { column: readCount(key, 'column'), isDescending: readBoolean(key, 'isDescending') }
}

function readFilter(filter: JsonRecord): ColumnFilter {
  return {
    column: readCount(filter, 'column'),
    operator: readOneOf(filter, 'operator', isFilterOperator),
    values: readStrings(filter, 'values'),
  }
}

export function readBlock(record: JsonRecord, key: string): CellBlock {
  const block = readNested(record, key)
  const firstRow = readCount(block, 'firstRow')
  const lastRow = readCount(block, 'lastRow')
  if (firstRow > lastRow) {
    throw new TypeError(`"${key}" must start before it ends`)
  }
  return { firstRow, lastRow, columns: readCounts(block, 'columns') }
}
