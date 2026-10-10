import type { CellValue, Row } from '../engine/query.ts'
import { previewCell } from './cells.ts'
import type { WireRow } from './protocol.ts'

// Messages may travel as JSON, where NaN and Infinity would arrive as null: they travel as text.
export function toWireValue(value: CellValue): CellValue {
  return typeof value === 'number' && !Number.isFinite(value) ? String(value) : value
}

// A row for the grid, with long text cut to `maxCellLength` characters.
export function toWireRow(row: Row, maxCellLength: number): WireRow {
  const truncated: number[] = []
  const cells = row.map((value, column) => {
    const preview = previewCell(toWireValue(value), maxCellLength)
    if (preview.isTruncated) {
      truncated.push(column)
    }
    return preview.value
  })
  return { cells, truncated }
}
