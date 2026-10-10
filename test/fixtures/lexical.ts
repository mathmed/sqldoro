// The lexical rules of the two dialects sqldoro ships, for the tests of the core (which cannot import
// the drivers). The driver tests check that their dialects declare the same rules.
import type { LexicalRules } from '../../src/core/sql/lexical-rules.ts'

export const MYSQL_LEXICAL: LexicalRules = {
  stringQuotes: ["'", '"'],
  identifierQuotes: ['`'],
  hasBackslashEscapes: true,
  hasEscapeStrings: false,
  hasDollarQuotes: false,
  hasHashComments: true,
  hasSpacedDashComments: true,
  hasNestedComments: false,
  hasExecutableComments: true,
  hasLowerCaseFolding: false,
}

export const POSTGRES_LEXICAL: LexicalRules = {
  stringQuotes: ["'"],
  identifierQuotes: ['"'],
  hasBackslashEscapes: false,
  hasEscapeStrings: true,
  hasDollarQuotes: true,
  hasHashComments: false,
  hasSpacedDashComments: false,
  hasNestedComments: true,
  hasExecutableComments: false,
  hasLowerCaseFolding: true,
}
