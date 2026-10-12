import { describe, expect, it } from 'vitest'

import { selectionOf } from './text-selection.ts'

describe('selectionOf', () => {
  it('should give the text selected in a field, and nothing without one', () => {
    const sut = document.createElement('textarea')
    sut.value = 'SELECT 1;\nSELECT 2'
    expect(selectionOf(sut)).toBe('')

    sut.setSelectionRange(10, 18)

    expect(selectionOf(sut)).toBe('SELECT 2')
    expect(selectionOf(null)).toBe('')
  })
})
