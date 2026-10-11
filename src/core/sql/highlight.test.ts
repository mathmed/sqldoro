import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { HighlightKind, highlightSql } from './highlight.ts'

const KEYWORDS: ReadonlySet<string> = new Set(['AND', 'IS', 'NULL', 'LIKE'])

describe('highlightSql', () => {
  it('should color each part of a condition, keeping the text as typed', () => {
    const text = `status = 'open' and "Total" >= 10.5 -- big\nOR x IS null`
    const spans = highlightSql(text, POSTGRES_LEXICAL, KEYWORDS)

    expect(spans.map((span) => span.text).join('')).toBe(text)
    expect(spans.filter((span) => span.kind !== HighlightKind.Plain)).toStrictEqual([
      { text: 'status', kind: HighlightKind.Identifier },
      { text: '=', kind: HighlightKind.Operator },
      { text: "'open'", kind: HighlightKind.String },
      { text: 'and', kind: HighlightKind.Keyword },
      { text: '"Total"', kind: HighlightKind.Identifier },
      { text: '>', kind: HighlightKind.Operator },
      { text: '=', kind: HighlightKind.Operator },
      { text: '10.5', kind: HighlightKind.Number },
      { text: '-- big', kind: HighlightKind.Comment },
      { text: 'OR', kind: HighlightKind.Identifier },
      { text: 'x', kind: HighlightKind.Identifier },
      { text: 'IS', kind: HighlightKind.Keyword },
      { text: 'null', kind: HighlightKind.Keyword },
    ])
  })

  it('should color comments, placeholders and statements ends of each dialect', () => {
    const spans = highlightSql('/*! a */ # b\n/* c */ ? ;', MYSQL_LEXICAL, KEYWORDS)

    expect(spans.map((span) => span.kind)).toStrictEqual([
      HighlightKind.Comment,
      HighlightKind.Plain,
      HighlightKind.Comment,
      HighlightKind.Plain,
      HighlightKind.Comment,
      HighlightKind.Plain,
      HighlightKind.Operator,
      HighlightKind.Plain,
      HighlightKind.Operator,
    ])
  })

  it('should color an open string to the end', () => {
    expect(highlightSql("name LIKE 'ab", POSTGRES_LEXICAL, KEYWORDS).at(-1)).toStrictEqual({
      text: "'ab",
      kind: HighlightKind.String,
    })
  })

  it('should give nothing for an empty text', () => {
    expect(highlightSql('', POSTGRES_LEXICAL, KEYWORDS)).toStrictEqual([])
  })
})
