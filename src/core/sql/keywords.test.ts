import { describe, expect, it } from 'vitest'

import { RESERVED_WORDS, STANDARD_KEYWORDS } from './keywords.ts'

const KEYWORD = /^[A-Z][A-Z_]*$/

function isSorted(words: readonly string[]): boolean {
  return words.every((word, index) => index === 0 || (words[index - 1] ?? '') < word)
}

describe('STANDARD_KEYWORDS', () => {
  it('should list each keyword once, as an upper-case word, in alphabetical order', () => {
    expect(STANDARD_KEYWORDS.filter((word) => !KEYWORD.test(word))).toStrictEqual([])
    expect(isSorted(STANDARD_KEYWORDS)).toBe(true)
  })

  it('should cover the clauses, joins and functions of everyday queries', () => {
    expect(STANDARD_KEYWORDS).toEqual(
      expect.arrayContaining(['SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP', 'ORDER', 'COUNT']),
    )
  })
})

describe('RESERVED_WORDS', () => {
  it('should hold upper-case words, in alphabetical order', () => {
    const words = [...RESERVED_WORDS]

    expect(words.filter((word) => !KEYWORD.test(word))).toStrictEqual([])
    expect(isSorted(words)).toBe(true)
  })

  it('should hold the words that need quotes to name something in either dialect', () => {
    expect(['SELECT', 'ORDER', 'USER', 'TO'].every((word) => RESERVED_WORDS.has(word))).toBe(true)
    expect(RESERVED_WORDS.has('COUNT')).toBe(false)
  })
})
