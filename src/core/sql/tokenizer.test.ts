import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import type { LexicalRules } from './lexical-rules.ts'
import { tokenize } from './tokenizer.ts'
import type { TokenKind } from './tokens.ts'

type Brief = readonly [TokenKind, string] | readonly [TokenKind, string, 'open']

function brief(text: string, rules: LexicalRules): Brief[] {
  return tokenize(text, rules).map((token) =>
    token.isOpen ? [token.kind, token.text, 'open'] : [token.kind, token.text],
  )
}

function kinds(text: string, rules: LexicalRules): TokenKind[] {
  return tokenize(text, rules)
    .filter((token) => token.kind !== 'whitespace')
    .map((token) => token.kind)
}

describe('tokenize', () => {
  it('should cover every character with tokens that know their offsets', () => {
    const sut = tokenize('SELECT a;', POSTGRES_LEXICAL)

    expect(sut).toStrictEqual([
      { kind: 'word', start: 0, end: 6, text: 'SELECT', isOpen: false },
      { kind: 'whitespace', start: 6, end: 7, text: ' ', isOpen: false },
      { kind: 'word', start: 7, end: 8, text: 'a', isOpen: false },
      { kind: 'semicolon', start: 8, end: 9, text: ';', isOpen: false },
    ])
  })

  it('should return no token for an empty text', () => {
    expect(tokenize('', MYSQL_LEXICAL)).toStrictEqual([])
  })

  it('should read words with digits, underscores, dollars and letters beyond ASCII', () => {
    expect(brief('a_1$b ção _x', POSTGRES_LEXICAL)).toStrictEqual([
      ['word', 'a_1$b'],
      ['whitespace', ' '],
      ['word', 'ção'],
      ['whitespace', ' '],
      ['word', '_x'],
    ])
  })

  it('should read numbers with decimals, exponents and underscores', () => {
    expect(brief('1 2.5 .55 3. 1e10 2.5E-3 1_000 7e', POSTGRES_LEXICAL)).toStrictEqual([
      ['number', '1'],
      ['whitespace', ' '],
      ['number', '2.5'],
      ['whitespace', ' '],
      ['number', '.55'],
      ['whitespace', ' '],
      ['number', '3.'],
      ['whitespace', ' '],
      ['number', '1e10'],
      ['whitespace', ' '],
      ['number', '2.5E-3'],
      ['whitespace', ' '],
      ['number', '1_000'],
      ['whitespace', ' '],
      ['number', '7'],
      ['word', 'e'],
    ])
  })

  it('should read positional and question mark parameters', () => {
    expect(brief('$1 $23 ?', POSTGRES_LEXICAL)).toStrictEqual([
      ['parameter', '$1'],
      ['whitespace', ' '],
      ['parameter', '$23'],
      ['whitespace', ' '],
      ['parameter', '?'],
    ])
  })

  it('should make one symbol of every other character', () => {
    expect(brief('a.b(1)::int', POSTGRES_LEXICAL)).toStrictEqual([
      ['word', 'a'],
      ['symbol', '.'],
      ['word', 'b'],
      ['symbol', '('],
      ['number', '1'],
      ['symbol', ')'],
      ['symbol', ':'],
      ['symbol', ':'],
      ['word', 'int'],
    ])
  })

  it('should read whitespace of every kind as one token', () => {
    expect(brief(' \t\r\n a', POSTGRES_LEXICAL)).toStrictEqual([
      ['whitespace', ' \t\r\n '],
      ['word', 'a'],
    ])
  })

  describe('strings', () => {
    it('should read a string with doubled quotes inside', () => {
      expect(brief("'it''s; ok' x", POSTGRES_LEXICAL)).toStrictEqual([
        ['string', "'it''s; ok'"],
        ['whitespace', ' '],
        ['word', 'x'],
      ])
    })

    it('should read empty strings and strings that are only doubled quotes', () => {
      expect(brief("'' ''''", POSTGRES_LEXICAL)).toStrictEqual([
        ['string', "''"],
        ['whitespace', ' '],
        ['string', "''''"],
      ])
    })

    it('should read backslash escapes in MySQL strings', () => {
      expect(brief("'a\\'; b' c", MYSQL_LEXICAL)).toStrictEqual([
        ['string', "'a\\'; b'"],
        ['whitespace', ' '],
        ['word', 'c'],
      ])
    })

    it('should read a backslash before a doubled quote and at the end of a MySQL string', () => {
      expect(brief("'a\\\\' 'b''c\\\\'", MYSQL_LEXICAL)).toStrictEqual([
        ['string', "'a\\\\'"],
        ['whitespace', ' '],
        ['string', "'b''c\\\\'"],
      ])
    })

    it('should keep backslashes literal in PostgreSQL strings', () => {
      expect(brief("'a\\' b", POSTGRES_LEXICAL)).toStrictEqual([
        ['string', "'a\\'"],
        ['whitespace', ' '],
        ['word', 'b'],
      ])
    })

    it('should read backslash escapes in PostgreSQL E strings only', () => {
      expect(brief("E'a\\'; b' e'\\\\' x", POSTGRES_LEXICAL)).toStrictEqual([
        ['string', "E'a\\'; b'"],
        ['whitespace', ' '],
        ['string', "e'\\\\'"],
        ['whitespace', ' '],
        ['word', 'x'],
      ])
    })

    it('should read E followed by a quote as a word and a string in MySQL', () => {
      expect(brief("E'a'", MYSQL_LEXICAL)).toStrictEqual([
        ['word', 'E'],
        ['string', "'a'"],
      ])
    })

    it('should read double quotes as strings in MySQL, with escapes and doubled quotes', () => {
      expect(brief('"a\\"b""c" d', MYSQL_LEXICAL)).toStrictEqual([
        ['string', '"a\\"b""c"'],
        ['whitespace', ' '],
        ['word', 'd'],
      ])
    })

    it('should run an unterminated string to the end of the text', () => {
      expect(brief("SELECT 'abc; def", POSTGRES_LEXICAL)).toStrictEqual([
        ['word', 'SELECT'],
        ['whitespace', ' '],
        ['string', "'abc; def", 'open'],
      ])
      expect(brief("'a\\'", MYSQL_LEXICAL)).toStrictEqual([['string', "'a\\'", 'open']])
      expect(brief("E'a\\'", POSTGRES_LEXICAL)).toStrictEqual([['string', "E'a\\'", 'open']])
    })

    it('should read a string quote that reads escapes without a known escape set as plain', () => {
      const rules: LexicalRules = { ...MYSQL_LEXICAL, stringQuotes: ['~'], identifierQuotes: [] }

      expect(brief('~a\\~ b', rules)).toStrictEqual([
        ['string', '~a\\~'],
        ['whitespace', ' '],
        ['word', 'b'],
      ])
    })
  })

  describe('dollar-quoted strings', () => {
    it('should read $$ strings with semicolons and quotes inside', () => {
      expect(brief("$$ a; 'b' $$;", POSTGRES_LEXICAL)).toStrictEqual([
        ['string', "$$ a; 'b' $$"],
        ['semicolon', ';'],
      ])
    })

    it('should read tagged strings that only close with the same tag', () => {
      expect(brief('$fn$ a $$ b; $x$ $fn$ c', POSTGRES_LEXICAL)).toStrictEqual([
        ['string', '$fn$ a $$ b; $x$ $fn$'],
        ['whitespace', ' '],
        ['word', 'c'],
      ])
    })

    it('should not read a tag that starts with a digit', () => {
      expect(kinds('$1$', POSTGRES_LEXICAL)).toStrictEqual(['parameter', 'symbol'])
    })

    it('should run an unterminated dollar string to the end', () => {
      expect(brief('$body$ a;', POSTGRES_LEXICAL)).toStrictEqual([['string', '$body$ a;', 'open']])
    })

    it('should not read dollar quotes in MySQL', () => {
      expect(kinds('$$a;$$', MYSQL_LEXICAL)).toStrictEqual([
        'symbol',
        'symbol',
        'word',
        'semicolon',
        'symbol',
        'symbol',
      ])
    })
  })

  describe('quoted identifiers', () => {
    it('should read double-quoted identifiers with doubled quotes in PostgreSQL', () => {
      expect(brief('"a ""b"";" c', POSTGRES_LEXICAL)).toStrictEqual([
        ['quotedIdentifier', '"a ""b"";"'],
        ['whitespace', ' '],
        ['word', 'c'],
      ])
      expect(brief('"a\\" c', POSTGRES_LEXICAL)).toStrictEqual([
        ['quotedIdentifier', '"a\\"'],
        ['whitespace', ' '],
        ['word', 'c'],
      ])
    })

    it('should read backtick identifiers in MySQL without backslash escapes', () => {
      expect(brief('`a\\` `b``c`', MYSQL_LEXICAL)).toStrictEqual([
        ['quotedIdentifier', '`a\\`'],
        ['whitespace', ' '],
        ['quotedIdentifier', '`b``c`'],
      ])
    })

    it('should run an unterminated identifier to the end', () => {
      expect(brief('"abc', POSTGRES_LEXICAL)).toStrictEqual([['quotedIdentifier', '"abc', 'open']])
    })

    it('should not read backticks as quotes in PostgreSQL', () => {
      expect(kinds('`a`', POSTGRES_LEXICAL)).toStrictEqual(['symbol', 'word', 'symbol'])
    })
  })

  describe('comments', () => {
    it('should read a -- comment to the end of the line', () => {
      expect(brief('a -- b; c\nd', POSTGRES_LEXICAL)).toStrictEqual([
        ['word', 'a'],
        ['whitespace', ' '],
        ['lineComment', '-- b; c'],
        ['whitespace', '\n'],
        ['word', 'd'],
      ])
    })

    it('should read a comment on the last line to the end of the text', () => {
      expect(brief('--x', POSTGRES_LEXICAL)).toStrictEqual([['lineComment', '--x']])
    })

    it('should read -- without a space as a comment in PostgreSQL only', () => {
      expect(kinds('1--2', POSTGRES_LEXICAL)).toStrictEqual(['number', 'lineComment'])
      expect(kinds('1--2', MYSQL_LEXICAL)).toStrictEqual(['number', 'symbol', 'symbol', 'number'])
    })

    it('should read -- followed by a space, a tab, a newline or the end as a comment in MySQL', () => {
      expect(kinds('-- a', MYSQL_LEXICAL)).toStrictEqual(['lineComment'])
      expect(kinds('--\ta', MYSQL_LEXICAL)).toStrictEqual(['lineComment'])
      expect(kinds('--\na', MYSQL_LEXICAL)).toStrictEqual(['lineComment', 'word'])
      expect(kinds('--', MYSQL_LEXICAL)).toStrictEqual(['lineComment'])
      expect(kinds('--!', MYSQL_LEXICAL)).toStrictEqual(['symbol', 'symbol', 'symbol'])
    })

    it('should read # comments in MySQL only', () => {
      expect(brief('# a; b\nc', MYSQL_LEXICAL)).toStrictEqual([
        ['lineComment', '# a; b'],
        ['whitespace', '\n'],
        ['word', 'c'],
      ])
      expect(kinds('#a', POSTGRES_LEXICAL)).toStrictEqual(['symbol', 'word'])
    })

    it('should read block comments with semicolons inside', () => {
      expect(brief('/* a; */b', MYSQL_LEXICAL)).toStrictEqual([
        ['blockComment', '/* a; */'],
        ['word', 'b'],
      ])
    })

    it('should not close a block comment with the star of its opener', () => {
      expect(brief('/*/ a */b', MYSQL_LEXICAL)).toStrictEqual([
        ['blockComment', '/*/ a */'],
        ['word', 'b'],
      ])
      expect(brief('/*/ a */b', POSTGRES_LEXICAL)).toStrictEqual([
        ['blockComment', '/*/ a */'],
        ['word', 'b'],
      ])
    })

    it('should nest block comments in PostgreSQL', () => {
      expect(brief('/* a /* b */ c; */d', POSTGRES_LEXICAL)).toStrictEqual([
        ['blockComment', '/* a /* b */ c; */'],
        ['word', 'd'],
      ])
    })

    it('should not nest block comments in MySQL', () => {
      expect(brief('/* a /* b */ c', MYSQL_LEXICAL)).toStrictEqual([
        ['blockComment', '/* a /* b */'],
        ['whitespace', ' '],
        ['word', 'c'],
      ])
    })

    it('should run unterminated block comments to the end', () => {
      expect(brief('/* a', MYSQL_LEXICAL)).toStrictEqual([['blockComment', '/* a', 'open']])
      expect(brief('/* a /* b */', POSTGRES_LEXICAL)).toStrictEqual([
        ['blockComment', '/* a /* b */', 'open'],
      ])
    })

    it('should read MySQL executable comments as code', () => {
      expect(brief('/*!40101 SET x=1 */;', MYSQL_LEXICAL)).toStrictEqual([
        ['executableComment', '/*!40101 SET x=1 */'],
        ['semicolon', ';'],
      ])
      expect(kinds('/*! a', MYSQL_LEXICAL)).toStrictEqual(['executableComment'])
      expect(kinds('/*!a*/', POSTGRES_LEXICAL)).toStrictEqual(['blockComment'])
    })
  })
})
