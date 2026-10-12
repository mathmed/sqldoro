import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import {
  WHERE_KEYWORDS,
  whereCompletion,
  type WhereSource,
  WhereSuggestionKind,
} from './where-completion.ts'

const SOURCE: WhereSource = {
  columns: ['id', 'status', 'Created At', 'kind'],
  tables: [],
  choices: new Map([['status', ['open', 'closed', "it's"]]]),
  keywords: ['ILIKE', 'and'],
  dialect: POSTGRES_DIALECT,
}

function labelsAt(text: string, source: WhereSource = SOURCE): string[] | undefined {
  return whereCompletion(text, text.length, source)?.suggestions.map(({ label }) => label)
}

describe('whereCompletion', () => {
  it('should offer the columns and the keywords where a name goes', () => {
    const completion = whereCompletion('', 0, SOURCE)

    expect(completion?.from).toBe(0)
    expect(completion?.to).toBe(0)
    expect(completion?.suggestions.slice(0, 5)).toStrictEqual([
      { label: 'id', kind: WhereSuggestionKind.Column, insertText: 'id' },
      { label: 'status', kind: WhereSuggestionKind.Column, insertText: 'status' },
      { label: 'Created At', kind: WhereSuggestionKind.Column, insertText: '"Created At"' },
      { label: 'kind', kind: WhereSuggestionKind.Column, insertText: 'kind' },
      { label: 'AND', kind: WhereSuggestionKind.Keyword, insertText: 'AND' },
    ])
    expect(completion?.suggestions).toHaveLength(4 + WHERE_KEYWORDS.length + 2)
  })

  it('should offer the tables of the schema after the columns, quoted where they need it', () => {
    const source = { ...SOURCE, tables: ['status_log', 'Order Lines'] }

    expect(whereCompletion('SELECT * FROM stat', 18, source)?.suggestions).toStrictEqual([
      { label: 'status', kind: WhereSuggestionKind.Column, insertText: 'status' },
      { label: 'status_log', kind: WhereSuggestionKind.Table, insertText: 'status_log' },
    ])
    expect(labelsAt('JOIN Or', source)).toStrictEqual(['Order Lines', 'OR'])
    expect(whereCompletion('JOIN Or', 7, source)?.suggestions.at(0)?.insertText).toBe(
      '"Order Lines"',
    )
  })

  it('should keep what starts like the word being typed, without case, and replace it', () => {
    const text = 'id > 1 AND st'
    const completion = whereCompletion(text, text.length, SOURCE)

    expect(completion?.from).toBe(11)
    expect(completion?.suggestions.map(({ label }) => label)).toStrictEqual(['status'])
    expect(labelsAt('id > 1 a')).toStrictEqual(['AND', 'and'])
    expect(labelsAt('il')).toStrictEqual(['ILIKE'])
  })

  it('should offer the operators after a column', () => {
    expect(labelsAt('status ')).toStrictEqual([
      '=',
      '<>',
      '<',
      '<=',
      '>',
      '>=',
      'LIKE',
      'NOT LIKE',
      'IN ()',
      'BETWEEN',
      'IS NULL',
      'IS NOT NULL',
    ])
    expect(labelsAt('"Created At" i')).toStrictEqual(['IN ()', 'IS NULL', 'IS NOT NULL'])
    expect(
      whereCompletion('id ', 3, SOURCE)?.suggestions.find(({ label }) => label === 'IN ()'),
    ).toStrictEqual({ label: 'IN ()', kind: WhereSuggestionKind.Operator, insertText: 'IN (' })
  })

  it('should offer the values of an enum column once it is compared', () => {
    expect(whereCompletion('status = ', 9, SOURCE)?.suggestions).toStrictEqual([
      { label: 'open', kind: WhereSuggestionKind.Value, insertText: "'open'" },
      { label: 'closed', kind: WhereSuggestionKind.Value, insertText: "'closed'" },
      { label: "it's", kind: WhereSuggestionKind.Value, insertText: "'it''s'" },
    ])
    expect(labelsAt("STATUS IN ('open', ")).toStrictEqual(['open', 'closed', "it's"])
    expect(labelsAt('status != ')).toStrictEqual(['open', 'closed', "it's"])
  })

  it('should offer the values of an enum that start like the string being typed', () => {
    const text = "id > 2 AND status = 'c"
    const completion = whereCompletion(text, text.length, SOURCE)

    expect(completion?.from).toBe(20)
    expect(completion?.suggestions.map(({ insertText }) => insertText)).toStrictEqual(["'closed'"])
  })

  it('should offer names to compare a column without values with, and no string', () => {
    expect(labelsAt('kind = ')).toContain('id')
    expect(labelsAt('= ')).toContain('NULL')
    expect(labelsAt("kind = 'a")).toStrictEqual([])
    expect(labelsAt("name = 'a")).toStrictEqual([])
  })

  it('should offer names again after a value', () => {
    expect(labelsAt("status = 'open' ")).toContain('AND')
    expect(labelsAt("status = 'open' ")).toContain('id')
  })

  it('should offer nothing inside a comment, a quoted name or a number', () => {
    expect(whereCompletion('id = 1 -- st', 12, SOURCE)).toBeUndefined()
    expect(whereCompletion('"Crea', 5, SOURCE)).toBeUndefined()
    expect(whereCompletion('id = 12', 7, SOURCE)).toBeUndefined()
    expect(whereCompletion("note = 'done' ", 13, SOURCE)).toBeUndefined()
  })

  it('should complete at the cursor, whatever follows it', () => {
    expect(whereCompletion('sta AND id = 1', 3, SOURCE)?.suggestions).toHaveLength(1)
  })

  it('should quote names as the dialect needs', () => {
    const source = { ...SOURCE, columns: ['Total', 'order'], dialect: MYSQL_DIALECT }

    expect(
      whereCompletion('', 0, source)
        ?.suggestions.slice(0, 2)
        .map(({ insertText }) => insertText),
    ).toStrictEqual(['Total', '`order`'])
  })
})

describe('what a condition is made of', () => {
  it('should offer the words of a condition', () => {
    expect(WHERE_KEYWORDS).toStrictEqual([
      'AND',
      'OR',
      'NOT',
      'IS',
      'NULL',
      'IN',
      'LIKE',
      'BETWEEN',
      'EXISTS',
      'TRUE',
      'FALSE',
      'CASE',
      'WHEN',
      'THEN',
      'ELSE',
      'END',
    ])
  })

  it('should offer the values of an enum after every way of comparing it', () => {
    for (const text of [
      'status = ',
      'status != ',
      'status < ',
      'status > ',
      'status LIKE ',
      'status IN (',
      "status IN ('open', ",
    ]) {
      expect(labelsAt(text)).toStrictEqual(['open', 'closed', "it's"])
    }
  })

  it('should offer at most 50 suggestions', () => {
    const columns = Array.from({ length: 60 }, (...[, index]) => `c${String(index)}`)

    expect(labelsAt('c', { ...SOURCE, columns })).toHaveLength(50)
  })

  it('should insert an operator as it reads, and IN with its parenthesis opened', () => {
    const inserted = whereCompletion('status ', 7, SOURCE)?.suggestions.map(
      ({ insertText }) => insertText,
    )

    expect(inserted?.slice(0, 2)).toStrictEqual(['=', '<>'])
    expect(inserted).toContain('IN (')
  })
})
