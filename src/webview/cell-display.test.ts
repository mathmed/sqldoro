import { describe, expect, it } from 'vitest'

import { ColumnKind } from '../core/engine/query.ts'
import { detailText, detailView, displayCell, hexDump, MAX_DETAIL_LENGTH } from './cell-display.ts'

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

describe('detailView', () => {
  it('should show a value up to the limit whole and formatted', () => {
    expect(detailView('{"a":1}', ColumnKind.Json)).toStrictEqual({
      text: '{\n  "a": 1\n}',
      wholeLength: null,
    })
    expect(detailView('a'.repeat(MAX_DETAIL_LENGTH), ColumnKind.Text)).toStrictEqual({
      text: 'a'.repeat(MAX_DETAIL_LENGTH),
      wholeLength: null,
    })
    expect(detailView(null, ColumnKind.Text)).toStrictEqual({ text: 'NULL', wholeLength: null })
  })

  it('should show only the start of a longer value, as it is, and its whole length', () => {
    const json = `[${'1,'.repeat(MAX_DETAIL_LENGTH)}1]`

    expect(detailView(json, ColumnKind.Json)).toStrictEqual({
      text: json.slice(0, MAX_DETAIL_LENGTH),
      wholeLength: json.length,
    })
  })

  it('should dump the start of a long binary value', () => {
    const view = detailView(`0x${'ab'.repeat(MAX_DETAIL_LENGTH)}`, ColumnKind.Binary)

    expect(view.wholeLength).toBe(2 + 2 * MAX_DETAIL_LENGTH)
    expect(view.text.startsWith('00000000  ab ab')).toBe(true)
    // 99,999 whole bytes, 16 to a line
    expect(view.text.split('\n')).toHaveLength(6250)
  })
})
