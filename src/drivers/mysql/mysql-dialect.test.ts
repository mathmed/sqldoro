import { describe, expect, it } from 'vitest'

import grammar from '../../../syntaxes/sql-keywords.injection.tmLanguage.json' with { type: 'json' }
import { HighlightKind, highlightSql } from '../../core/sql/highlight.ts'
import { RESERVED_WORDS, STANDARD_KEYWORDS } from '../../core/sql/keywords.ts'
import { MYSQL_DIALECT } from './mysql-dialect.ts'

// The words the webviews color as keywords in the SQL of a MySQL connection: the standard keywords,
// the reserved words and those of the dialect, in upper case.
const COLORED: ReadonlySet<string> = new Set([
  ...STANDARD_KEYWORDS,
  ...RESERVED_WORDS,
  ...MYSQL_DIALECT.keywords,
])
// The group of the grammar's pattern that lists its words: "(?i)(?<!...)(analyze|databases|...)(?!...)".
const WORD_LIST = /^[a-z|]+$/u

function keywordsOf(sql: string): string[] {
  return highlightSql(sql, MYSQL_DIALECT.lexical, COLORED)
    .filter(({ kind }) => kind === HighlightKind.Keyword)
    .map(({ text }) => text)
}

describe('the keywords of the MySQL dialect', () => {
  it.each(['flush privileges;', 'FLUSH PRIVILEGES;'])('should color %j as keywords', (sql) => {
    expect(keywordsOf(sql).map((word) => word.toUpperCase())).toEqual(['FLUSH', 'PRIVILEGES'])
  })

  it('should color the words of the administration statements', () => {
    const sql = [
      "GRANT SELECT ON condoflex.* TO 'claude_devs'@'%' WITH GRANT OPTION;",
      "REVOKE RELOAD ON *.* FROM 'claude_devs'@'%';",
      "CREATE ROLE reader; CREATE USER 'app'@'%' IDENTIFIED BY 'secret';",
      'FLUSH TABLES; FLUSH LOGS; FLUSH HOSTS; FLUSH STATUS;',
    ].join('\n')

    expect(keywordsOf(sql)).toEqual(
      expect.arrayContaining([
        'OPTION',
        'RELOAD',
        'ROLE',
        'IDENTIFIED',
        'TABLES',
        'LOGS',
        'HOSTS',
        'STATUS',
      ]),
    )
    expect(keywordsOf("SELECT 'flush privileges' FROM t")).toEqual(['SELECT', 'FROM'])
  })

  it('should know every word the editors color for MySQL administration', () => {
    const groups = grammar.repository.administration.match.split(/[()]/u)
    const words = groups.find((group) => WORD_LIST.test(group))?.split('|') ?? []

    expect(words).toContain('flush')
    expect(words.filter((word) => !COLORED.has(word.toUpperCase()))).toEqual([])
  })
})
