import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { tokenize } from './tokenizer.ts'
import { identifierName, isIdentifier, isKeyword, isText, isTrivia, type Token } from './tokens.ts'

function only(text: string, rules = POSTGRES_LEXICAL): Token {
  const [first] = tokenize(text, rules)
  if (first === undefined) {
    throw new Error('no token')
  }
  return first
}

describe('isTrivia', () => {
  it('should see whitespace and comments as trivia, and nothing else', () => {
    expect([' ', '-- a', '/* a */'].map((text) => isTrivia(only(text)))).toStrictEqual([
      true,
      true,
      true,
    ])
    expect(
      ["'a'", 'a', ';', '/*! a */'].map((text) => isTrivia(only(text, MYSQL_LEXICAL))),
    ).toStrictEqual([false, false, false, false])
  })
})

describe('isText', () => {
  it('should see strings and comments as text, and nothing else', () => {
    expect(["'a'", '-- a', '/* a */'].map((text) => isText(only(text)))).toStrictEqual([
      true,
      true,
      true,
    ])
    expect(['"a"', 'a', ' ', '1'].map((text) => isText(only(text)))).toStrictEqual([
      false,
      false,
      false,
      false,
    ])
  })
})

describe('isKeyword', () => {
  it('should match words without case against any of the keywords', () => {
    expect(isKeyword(only('select'), 'FROM', 'SELECT')).toBe(true)
    expect(isKeyword(only('select'), 'FROM')).toBe(false)
  })

  it('should not match quoted identifiers, strings or nothing', () => {
    expect(isKeyword(only('"select"'), 'SELECT')).toBe(false)
    expect(isKeyword(only("'select'"), 'SELECT')).toBe(false)
    expect(isKeyword(undefined, 'SELECT')).toBe(false)
  })
})

describe('identifierName', () => {
  it('should unquote quoted identifiers and their doubled quotes', () => {
    expect(identifierName(only('"Order ""A"""'))).toBe('Order "A"')
    expect(identifierName(only('`a``b`', MYSQL_LEXICAL))).toBe('a`b')
  })

  it('should unquote an identifier that is still being typed', () => {
    expect(identifierName(only('"Ord'))).toBe('Ord')
  })

  it('should keep words as they are', () => {
    expect(identifierName(only('Orders'))).toBe('Orders')
  })
})

describe('isIdentifier', () => {
  it('should accept words and quoted identifiers only', () => {
    expect(isIdentifier(only('a'))).toBe(true)
    expect(isIdentifier(only('"a"'))).toBe(true)
    expect(isIdentifier(only("'a'"))).toBe(false)
    expect(isIdentifier(undefined)).toBe(false)
  })
})
