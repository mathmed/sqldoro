import { describe, expect, it } from 'vitest'

import { POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { codeTokens, findWord, scopeEnd, type StatementView, viewOf } from './statement-view.ts'

function view(sql: string): StatementView {
  const found = viewOf(codeTokens(sql, POSTGRES_LEXICAL) ?? [])
  if (found === undefined) {
    throw new Error('unbalanced')
  }
  return found
}

const isSelect = (word: string): boolean => word === 'SELECT'

describe('findWord', () => {
  const sut = view('SELECT 1 SELECT (SELECT) SELECT')
  const start = { index: 0, depth: 0 }

  it('should find the first wanted word after the start, at its depth', () => {
    expect(findWord(sut, { from: start, to: 7 }, isSelect)).toBe(2)
    expect(findWord(sut, { from: { index: 2, depth: 0 }, to: 7 }, isSelect)).toBe(6)
  })

  it('should stop before the end of the range', () => {
    expect(findWord(sut, { from: start, to: 2 }, isSelect)).toBe(-1)
    expect(findWord(sut, { from: start, to: 3 }, isSelect)).toBe(2)
  })

  it('should look at the depth of the start only', () => {
    expect(findWord(sut, { from: { index: 3, depth: 1 }, to: 7 }, isSelect)).toBe(4)
  })
})

describe('scopeEnd', () => {
  it('should end where the parentheses around the token close, or with the statement', () => {
    const sut = view('SELECT (a, (b), c) d')

    expect(scopeEnd(sut, { index: 2, depth: 1 })).toBe(9)
    expect(scopeEnd(sut, { index: 5, depth: 2 })).toBe(6)
    expect(scopeEnd(sut, { index: 0, depth: 0 })).toBe(11)
  })
})
