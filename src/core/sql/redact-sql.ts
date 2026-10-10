import type { LexicalRules } from './lexical-rules.ts'
import { tokenize } from './tokenizer.ts'
import { type Token, TokenKind } from './tokens.ts'

// Statements that set a password (CREATE USER ... IDENTIFIED BY '...', ALTER ROLE ... PASSWORD
// '...', CHANGE REPLICATION SOURCE TO SOURCE_PASSWORD = '...') and strings that mention one are kept
// in the history with their strings masked.
const IDENTIFIED = 'IDENTIFIED'
// PASSWORD itself and the options named after it: MASTER_PASSWORD, SOURCE_PASSWORD...
const PASSWORD = 'PASSWORD'
const SECRET_HINT = /passw(?:or)?d|secret/i
const MASK = "'***'"

export function redactSqlSecrets(sql: string, rules: LexicalRules): string {
  const tokens = tokenize(sql, rules)
  const hasSecretWord = tokens.some(isSecretWord)
  return tokens.map((token) => (isSecret(token, hasSecretWord) ? MASK : token.text)).join('')
}

// Only a word counts: names, strings and comments that say "password" do not set one.
function isSecretWord(token: Token): boolean {
  if (token.kind !== TokenKind.Word) {
    return false
  }
  const word = token.text.toUpperCase()
  return word === IDENTIFIED || word.endsWith(PASSWORD)
}

function isSecret(token: Token, hasSecretWord: boolean): boolean {
  return token.kind === TokenKind.String && (hasSecretWord || SECRET_HINT.test(token.text))
}
