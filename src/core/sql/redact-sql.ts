import type { LexicalRules } from './lexical-rules.ts'
import { tokenize } from './tokenizer.ts'
import { type Token, TokenKind } from './tokens.ts'

// Statements that set a password (CREATE USER ... IDENTIFIED BY '...', ALTER ROLE ... PASSWORD
// '...') and strings that mention one are kept in the history with their strings masked.
const SECRET_WORDS: ReadonlySet<string> = new Set(['IDENTIFIED', 'PASSWORD'])
const SECRET_HINT = /passw(?:or)?d|secret/i
const MASK = "'***'"

export function redactSqlSecrets(sql: string, rules: LexicalRules): string {
  const tokens = tokenize(sql, rules)
  // Only a word can be exactly one of these: strings, names and comments keep their delimiters.
  const hasSecretWord = tokens.some((token) => SECRET_WORDS.has(token.text.toUpperCase()))
  return tokens.map((token) => (isSecret(token, hasSecretWord) ? MASK : token.text)).join('')
}

function isSecret(token: Token, hasSecretWord: boolean): boolean {
  return token.kind === TokenKind.String && (hasSecretWord || SECRET_HINT.test(token.text))
}
