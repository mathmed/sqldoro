import type { CellValue } from '../engine/query.ts'

export interface CellPreview {
  readonly value: CellValue
  readonly isTruncated: boolean
}

const NULL_TEXT = 'NULL'
const LINE_BREAKS = /\r\n|\r|\n/g
const TABS = /\t/g
const LINE_BREAK_MARK = '↵'
const TAB_MARK = '→'

// Long text is cut before it reaches the grid: the cell detail asks for the whole value.
export function previewCell(value: CellValue, maxLength: number): CellPreview {
  if (typeof value !== 'string' || value.length <= maxLength) {
    return { value, isTruncated: false }
  }
  return { value: value.slice(0, maxLength), isTruncated: true }
}

// The text a value is searched and sorted by. NULL reads as NULL; an empty string stays empty.
export function cellText(value: CellValue): string {
  return value === null ? NULL_TEXT : String(value)
}

// A grid cell shows one line: line breaks and tabs become visible marks.
export function singleLine(text: string): string {
  return text.replaceAll(LINE_BREAKS, LINE_BREAK_MARK).replaceAll(TABS, TAB_MARK)
}
