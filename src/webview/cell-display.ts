import { type CellValue, ColumnKind } from '../core/engine/query.ts'
import { singleLine } from '../core/results/cells.ts'
import { prettyJson } from '../core/results/json-pretty.ts'

const CellLook = {
  Null: 'null',
  Empty: 'empty',
  Number: 'number',
  Boolean: 'boolean',
  Text: 'text',
} as const

type CellLook = (typeof CellLook)[keyof typeof CellLook]

export interface CellDisplay {
  readonly text: string
  readonly look: CellLook
}

const HEX_PREFIX = '0x'
const BYTES_PER_LINE = 16
const HEX_DIGITS_PER_BYTE = 2
const OFFSET_DIGITS = 8
const BYTE = /../g
const SPECIAL_VALUES: ReadonlyMap<CellValue, CellDisplay> = new Map([
  [null, { text: 'NULL', look: CellLook.Null }],
  ['', { text: 'empty', look: CellLook.Empty }],
])

// How a cell reads in the grid: NULL and the empty string look different, numbers line up right.
export function displayCell(value: CellValue, kind: ColumnKind): CellDisplay {
  const special = SPECIAL_VALUES.get(value)
  if (special !== undefined) {
    return special
  }
  if (typeof value === 'boolean') {
    return { text: String(value), look: CellLook.Boolean }
  }
  const isNumber = typeof value === 'number' || kind === ColumnKind.Number
  return { text: singleLine(String(value)), look: isNumber ? CellLook.Number : CellLook.Text }
}

// The detail shows this many characters of a value at most: laying out more would freeze the view
// for seconds. The whole value is copied (Ctrl+C) or exported.
export const MAX_DETAIL_LENGTH = 200_000

export interface DetailView {
  readonly text: string
  // The length of the whole value when the detail shows only its start; null when it shows it all.
  readonly wholeLength: number | null
}

// What the cell detail shows: the value formatted, or the start of a value too long for it.
export function detailView(value: CellValue, kind: ColumnKind): DetailView {
  const text = String(value)
  if (value === null || text.length <= MAX_DETAIL_LENGTH) {
    return { text: detailText(value, kind), wholeLength: null }
  }
  const start = text.slice(0, MAX_DETAIL_LENGTH)
  return { text: isHex(start, kind) ? detailText(start, kind) : start, wholeLength: text.length }
}

function isHex(text: string, kind: ColumnKind): boolean {
  return kind === ColumnKind.Binary && text.startsWith(HEX_PREFIX)
}

// The whole value, for the cell detail: JSON indented, binary values as a hex dump.
export function detailText(value: CellValue, kind: ColumnKind): string {
  if (value === null) {
    return 'NULL'
  }
  const text = String(value)
  if (isHex(text, kind)) {
    return hexDump(text.slice(HEX_PREFIX.length))
  }
  return prettyJson(text) ?? text
}

// 16 bytes per line, each line with its offset: 00000000  de ad be ef ...
export function hexDump(hex: string): string {
  const lineLength = BYTES_PER_LINE * HEX_DIGITS_PER_BYTE
  const lines: string[] = []
  for (let start = 0; start < hex.length; start += lineLength) {
    const bytes = hex.slice(start, start + lineLength).match(BYTE) ?? []
    const offset = (start / HEX_DIGITS_PER_BYTE)
      .toString(BYTES_PER_LINE)
      .padStart(OFFSET_DIGITS, '0')
    lines.push(`${offset}  ${bytes.join(' ')}`)
  }
  return lines.join('\n')
}
