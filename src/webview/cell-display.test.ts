import { describe, expect, it } from 'vitest'

import { ColumnKind } from '../core/engine/query.ts'
import { detailText, displayCell, hexDump } from './cell-display.ts'

describe('displayCell', () => {
  it('should show NULL apart from the empty string', () => {
    expect(displayCell(null, ColumnKind.Text)).toStrictEqual({ text: 'NULL', look: 'null' })
    expect(displayCell('', ColumnKind.Text)).toStrictEqual({ text: 'empty', look: 'empty' })
  })

  it('should line numbers up as numbers, exact ones too', () => {
    expect(displayCell(1.5, ColumnKind.Other)).toStrictEqual({ text: '1.5', look: 'number' })
    expect(displayCell('9007199254740993', ColumnKind.Number)).toStrictEqual({
      text: '9007199254740993',
      look: 'number',
    })
  })

  it('should show booleans and text on one line', () => {
    expect(displayCell(true, ColumnKind.Boolean)).toStrictEqual({ text: 'true', look: 'boolean' })
    expect(displayCell('a\nb', ColumnKind.Text)).toStrictEqual({ text: 'a↵b', look: 'text' })
  })
})

describe('detailText', () => {
  it('should show NULL, indent JSON and keep plain text', () => {
    expect(detailText(null, ColumnKind.Json)).toBe('NULL')
    expect(detailText('{"a":12345678901234567890}', ColumnKind.Json)).toBe(
      '{\n  "a": 12345678901234567890\n}',
    )
    expect(detailText('plain', ColumnKind.Text)).toBe('plain')
    expect(detailText(12, ColumnKind.Number)).toBe('12')
  })

  it('should dump binary values and keep other text of binary columns', () => {
    expect(detailText('0xdeadbeef', ColumnKind.Binary)).toBe('00000000  de ad be ef')
    expect(detailText('ab\\000', ColumnKind.Binary)).toBe('ab\\000')
  })
})

describe('hexDump', () => {
  it('should write 16 bytes per line with their offset', () => {
    expect(hexDump('00'.repeat(17))).toBe(
      `00000000  ${Array.from({ length: 16 }, () => '00').join(' ')}\n00000010  00`,
    )
    expect(hexDump('')).toBe('')
    expect(hexDump('a')).toBe('00000000  ')
  })
})
