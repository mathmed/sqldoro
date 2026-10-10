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

// The whole value, for the cell detail: JSON indented, binary values as a hex dump.
export function detailText(value: CellValue, kind: ColumnKind): string {
  if (value === null) {
    return 'NULL'
  }
  const text = String(value)
  if (kind === ColumnKind.Binary && text.startsWith(HEX_PREFIX)) {
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
