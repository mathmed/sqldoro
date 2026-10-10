// How a dialect writes strings, quoted identifiers and comments: enough to split a script into
// statements and to tell code from text without parsing SQL. Each driver declares its own rules.
export interface LexicalRules {
  // Quote characters that open a string: always ', and " in MySQL.
  readonly stringQuotes: readonly string[]
  // Quote characters that open an identifier: " in PostgreSQL, ` in MySQL.
  readonly identifierQuotes: readonly string[]
  // MySQL reads \' inside a string as a quote; PostgreSQL only inside E'...' strings.
  readonly hasBackslashEscapes: boolean
  readonly hasEscapeStrings: boolean
  // PostgreSQL's $$...$$ and $tag$...$tag$ strings.
  readonly hasDollarQuotes: boolean
  // MySQL's # comments, and its rule that -- only starts a comment when a space follows.
  readonly hasHashComments: boolean
  readonly hasSpacedDashComments: boolean
  // PostgreSQL nests /* */ comments; MySQL runs the code of /*! */ comments.
  readonly hasNestedComments: boolean
  readonly hasExecutableComments: boolean
  // PostgreSQL folds unquoted names to lower case: any other name must be quoted.
  readonly hasLowerCaseFolding: boolean
}
