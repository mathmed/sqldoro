import { describe, expect, it } from 'vitest'

import { type Dialect, qualifiedName, quoteIdentifier } from './dialect.ts'

const BACKTICK: Dialect = { identifierQuote: '`', hasSchemas: false }
const DOUBLE_QUOTE: Dialect = { identifierQuote: '"', hasSchemas: true }

describe('quoteIdentifier', () => {
  it('should wrap the identifier in the quote of the dialect', () => {
    expect(quoteIdentifier(BACKTICK, 'orders')).toBe('`orders`')
    expect(quoteIdentifier(DOUBLE_QUOTE, 'orders')).toBe('"orders"')
  })

  it('should double every quote inside the identifier', () => {
    expect(quoteIdentifier(BACKTICK, 'a`b``c')).toBe('`a``b````c`')
    expect(quoteIdentifier(DOUBLE_QUOTE, 'say "hi"')).toBe('"say ""hi"""')
  })

  it('should keep the quotes of other dialects as they are', () => {
    expect(quoteIdentifier(BACKTICK, 'say "hi"')).toBe('`say "hi"`')
  })

  it('should reject an empty identifier', () => {
    expect(() => quoteIdentifier(BACKTICK, '')).toThrow(new RangeError('Invalid identifier ""'))
  })

  it('should reject an identifier with a NUL character', () => {
    expect(() => quoteIdentifier(DOUBLE_QUOTE, 'a\u0000b')).toThrow(
      new RangeError('Invalid identifier "a\\u0000b"'),
    )
  })
})

describe('qualifiedName', () => {
  it('should quote each part and join them with dots', () => {
    expect(qualifiedName(DOUBLE_QUOTE, ['public', 'my.table'])).toBe('"public"."my.table"')
  })

  it('should return a single quoted part when there is only one', () => {
    expect(qualifiedName(BACKTICK, ['orders'])).toBe('`orders`')
  })
})
