// Dialects shaped like the ones the MySQL and PostgreSQL drivers declare, for the tests of the core
// and of the extension host.
import { BinaryLiteral, type Dialect, ParameterStyle } from '../../src/core/engine/dialect.ts'
import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from './lexical.ts'

export const MYSQL_DIALECT: Dialect = {
  identifierQuote: '`',
  hasSchemas: false,
  defaultSchema: '',
  lexical: MYSQL_LEXICAL,
  keywords: ['SHOW', 'Describe'],
  binaryLiteral: BinaryLiteral.HexString,
  parameterStyle: ParameterStyle.QuestionMark,
  textType: 'CHAR',
  explainPrefix: 'EXPLAIN FORMAT=TREE',
  explainAnalyzePrefix: 'EXPLAIN ANALYZE',
}

export const POSTGRES_DIALECT: Dialect = {
  identifierQuote: '"',
  hasSchemas: true,
  defaultSchema: 'public',
  lexical: POSTGRES_LEXICAL,
  keywords: ['ILIKE', 'RETURNING'],
  binaryLiteral: BinaryLiteral.ByteaHex,
  parameterStyle: ParameterStyle.Numbered,
  textType: 'TEXT',
  explainPrefix: 'EXPLAIN',
  explainAnalyzePrefix: 'EXPLAIN (ANALYZE, BUFFERS)',
}
