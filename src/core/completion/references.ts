import { RESERVED_WORDS } from '../sql/keywords.ts'
import { identifierName, isIdentifier, isKeyword, type Token, TokenKind } from '../sql/tokens.ts'

// A table or view named in a statement, with the alias that stands for it.
export interface TableReference {
  readonly parts: readonly string[]
  readonly alias: string | undefined
}

const INTRODUCERS = ['FROM', 'JOIN', 'UPDATE', 'INTO', 'TABLE']
const LIST_INTRODUCER = 'FROM'
const PART_AND_DOT = 2
const ALIAS_KEYWORD = 'AS'
// Words that can follow a table name without being its alias.
const NOT_ALIASES: ReadonlySet<string> = new Set([
  ...RESERVED_WORDS,
  'FETCH',
  'FORCE',
  'IGNORE',
  'LATERAL',
  'NATURAL',
  'PARTITION',
  'RETURNING',
  'STRAIGHT_JOIN',
  'TABLESAMPLE',
  'USE',
  'WINDOW',
])

interface Read<T> {
  readonly value: T
  readonly next: number
}

// The tables and views a statement reads or writes: after FROM (a list), JOIN, UPDATE, INTO and
// TABLE. Subqueries in FROM have no name to complete and are skipped.
export function tableReferences(tokens: readonly Token[]): TableReference[] {
  const references: TableReference[] = []
  tokens.forEach((token, index) => {
    if (isKeyword(token, ...INTRODUCERS)) {
      references.push(...referencesAfter(tokens, index + 1, isKeyword(token, LIST_INTRODUCER)))
    }
  })
  return references
}

function referencesAfter(
  tokens: readonly Token[],
  start: number,
  isList: boolean,
): TableReference[] {
  const reference = readReference(tokens, start)
  if (reference === undefined) {
    return []
  }
  const hasMore = isList && isSymbol(tokens.at(reference.next), ',')
  return hasMore
    ? [reference.value, ...referencesAfter(tokens, reference.next + 1, isList)]
    : [reference.value]
}

function readReference(tokens: readonly Token[], start: number): Read<TableReference> | undefined {
  const name = readName(tokens, start)
  if (name.value.length === 0) {
    return undefined
  }
  const alias = readAlias(tokens, name.next)
  return { value: { parts: name.value, alias: alias.value }, next: alias.next }
}

// A dotted name: schema.table, or table.
export function readName(tokens: readonly Token[], start: number): Read<readonly string[]> {
  const part = tokens.at(start)
  if (!isIdentifier(part) || isReserved(part)) {
    return { value: [], next: start }
  }
  if (!isSymbol(tokens.at(start + 1), '.')) {
    return { value: [identifierName(part)], next: start + 1 }
  }
  const rest = readName(tokens, start + PART_AND_DOT)
  return { value: [identifierName(part), ...rest.value], next: rest.next }
}

// The alias after a name: AS x, or x when it is not a word that can follow a table.
export function readAlias(tokens: readonly Token[], start: number): Read<string | undefined> {
  const aliasAt = isKeyword(tokens.at(start), ALIAS_KEYWORD) ? start + 1 : start
  const candidate = tokens.at(aliasAt)
  if (!isIdentifier(candidate) || isReserved(candidate)) {
    return { value: undefined, next: start }
  }
  return { value: identifierName(candidate), next: aliasAt + 1 }
}

function isReserved(token: Token | undefined): boolean {
  return token?.kind === TokenKind.Word && NOT_ALIASES.has(token.text.toUpperCase())
}

export function isSymbol(token: Token | undefined, symbol: string): token is Token {
  return token?.kind === TokenKind.Symbol && token.text === symbol
}

// The only table a statement reads, when it reads exactly one: INSERT statements copied from its
// result write to it.
export function soleTable(tokens: readonly Token[]): readonly string[] | undefined {
  const references = tableReferences(tokens)
  return references.length === 1 ? references.at(0)?.parts : undefined
}
