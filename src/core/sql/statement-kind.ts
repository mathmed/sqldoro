import type { LexicalRules } from './lexical-rules.ts'
import { tokenize } from './tokenizer.ts'
import { isTrivia, type Token, TokenKind } from './tokens.ts'

const SCHEMA_CHANGES: ReadonlySet<string> = new Set(['CREATE', 'ALTER', 'DROP', 'RENAME'])
// Queries that can be wrapped in SELECT * FROM (...) to sort or filter them on the server.
const WRAPPABLE_QUERIES: ReadonlySet<string> = new Set(['SELECT', 'WITH', 'TABLE', 'VALUES'])
// Words that write, lock, change the session or call something with effects. Any of them outside a
// string or a comment makes a query unsafe to run again: false alarms are the price of never
// repeating a write by mistake.
const UNSAFE_WORDS: ReadonlySet<string> = new Set([
  'ALTER',
  'ANALYZE',
  'BEGIN',
  'BENCHMARK',
  'CALL',
  'CLUSTER',
  'COMMIT',
  'COPY',
  'CREATE',
  'DBLINK',
  'DBLINK_EXEC',
  'DEALLOCATE',
  'DELETE',
  'DO',
  'DROP',
  'DUMPFILE',
  'EXEC',
  'EXECUTE',
  'FOR',
  'GET_LOCK',
  'GRANT',
  'HANDLER',
  'INSERT',
  'INTO',
  'KILL',
  'LISTEN',
  'LOAD',
  'LOCK',
  'LO_EXPORT',
  'LO_IMPORT',
  'LO_UNLINK',
  'MERGE',
  'NEXTVAL',
  'NOTIFY',
  'OPTIMIZE',
  'OUTFILE',
  'PG_ADVISORY_LOCK',
  'PG_ADVISORY_XACT_LOCK',
  'PG_CANCEL_BACKEND',
  'PG_NOTIFY',
  'PG_RELOAD_CONF',
  'PG_SLEEP',
  'PG_TERMINATE_BACKEND',
  'PG_TRY_ADVISORY_LOCK',
  'PREPARE',
  'REFRESH',
  'REINDEX',
  'RELEASE',
  'RELEASE_LOCK',
  'RENAME',
  'REPLACE',
  'REVOKE',
  'ROLLBACK',
  'SAVEPOINT',
  'SET',
  'SETVAL',
  'SET_CONFIG',
  'SHUTDOWN',
  'SLEEP',
  'START',
  'TRUNCATE',
  'UNLOCK',
  'UPDATE',
  'UPSERT',
  'VACUUM',
])
// MySQL runs the code inside /*! */ comments, and a second statement would escape the wrapping.
const UNSAFE_KINDS: ReadonlySet<TokenKind> = new Set([
  TokenKind.ExecutableComment,
  TokenKind.Semicolon,
])

export function significantTokens(sql: string, rules: LexicalRules): Token[] {
  return tokenize(sql, rules).filter((token) => !isTrivia(token))
}

// The first word of a statement in upper case, or an empty string when it starts with no word.
export function leadingKeyword(sql: string, rules: LexicalRules): string {
  return keywordOf(significantTokens(sql, rules)[0])
}

export function changesSchema(sql: string, rules: LexicalRules): boolean {
  return SCHEMA_CHANGES.has(leadingKeyword(sql, rules))
}

// A single SELECT, WITH, TABLE or VALUES query that only reads: it can run again, wrapped to sort
// or filter on the server, and be measured by EXPLAIN ANALYZE.
export function isReadOnlyQuery(sql: string, rules: LexicalRules): boolean {
  const tokens = significantTokens(sql, rules)
  return WRAPPABLE_QUERIES.has(keywordOf(tokens[0])) && !tokens.some(isUnsafe)
}

function keywordOf(token: Token | undefined): string {
  return token?.kind === TokenKind.Word ? token.text.toUpperCase() : ''
}

function isUnsafe(token: Token): boolean {
  return UNSAFE_KINDS.has(token.kind) || UNSAFE_WORDS.has(keywordOf(token))
}
