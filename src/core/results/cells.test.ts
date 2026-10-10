import { describe, expect, it } from 'vitest'

import { cellText, previewCell, singleLine } from './cells.ts'

describe('previewCell', () => {
  it('should keep values up to the limit as they are', () => {
    expect(previewCell('abc', 3)).toStrictEqual({ value: 'abc', isTruncated: false })
    expect(previewCell(12_345, 1)).toStrictEqual({ value: 12_345, isTruncated: false })
    expect(previewCell(null, 0)).toStrictEqual({ value: null, isTruncated: false })
  })

  it('should cut longer text and say so', () => {
    expect(previewCell('abcd', 3)).toStrictEqual({ value: 'abc', isTruncated: true })
  })
})

describe('cellText', () => {
  it('should read NULL apart from the empty string', () => {
    expect(cellText(null)).toBe('NULL')
    expect(cellText('')).toBe('')
  })

  it('should write numbers and booleans as text', () => {
    expect(cellText(1.5)).toBe('1.5')
    expect(cellText(false)).toBe('false')
  })
})

describe('singleLine', () => {
  it('should mark every line break and tab', () => {
    expect(singleLine('a\r\nb\nc\rd\te')).toBe('a↵b↵c↵d→e')
  })
})
