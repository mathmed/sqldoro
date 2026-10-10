import type { LexicalRules } from './lexical-rules.ts'
import { type Scan, SCANNERS } from './scanners.ts'
import { type Token, TokenKind } from './tokens.ts'

// Cuts SQL into tokens without understanding it: strings, quoted identifiers, comments, words and
// symbols. Every character belongs to exactly one token, so offsets map back to the text.
export function tokenize(text: string, rules: LexicalRules): Token[] {
  const tokens: Token[] = []
  let start = 0
  while (start < text.length) {
    const { kind, end, isOpen } = scanAt(text, start, rules)
    tokens.push({ kind, start, end, text: text.slice(start, end), isOpen })
    start = end
  }
  return tokens
}

function scanAt(text: string, start: number, rules: LexicalRules): Scan {
  for (const scanner of SCANNERS) {
    const scan = scanner(text, start, rules)
    if (scan !== undefined) {
      return scan
    }
  }
  return { kind: TokenKind.Symbol, end: start + 1, isOpen: false }
}
