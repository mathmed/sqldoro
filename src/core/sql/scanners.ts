import type { LexicalRules } from './lexical-rules.ts'
import { TokenKind } from './tokens.ts'

export interface Scan {
  readonly kind: TokenKind
  readonly end: number
  readonly isOpen: boolean
}

export type Scanner = (text: string, start: number, rules: LexicalRules) => Scan | undefined

// A sticky regular expression: it matches exactly at the position it is asked about.
class StickyPattern {
  readonly #regex: RegExp

  constructor(regex: RegExp) {
    this.#regex = regex
  }

  endAt(text: string, start: number): number | undefined {
    this.#regex.lastIndex = start
    return this.#regex.test(text) ? this.#regex.lastIndex : undefined
  }
}

const WHITESPACE = new StickyPattern(/\s+/y)
const WORD = new StickyPattern(/[A-Za-z_\u0080-\uFFFF][\w$\u0080-\uFFFF]*/y)
const DIGITS = new StickyPattern(/\d[\d_]*\.?\d*|\.\d+/y)
const EXPONENT = new StickyPattern(/[eE][+-]?\d+/y)
const PARAMETER = new StickyPattern(/\$\d+|\?/y)
const DOLLAR_TAG = new StickyPattern(/\$[A-Za-z_\u0080-\uFFFF][\w\u0080-\uFFFF]*\$/y)
const ESCAPE_STRING = new StickyPattern(/[eE]'/y)
const COMMENT_MARK = /\/\*|\*\//g
// Where a string that reads backslash escapes can end or skip a character.
const ESCAPING_STOPS: ReadonlyMap<string, RegExp> = new Map([
  ["'", /['\\]/g],
  ['"', /["\\]/g],
])
const EMPTY_DOLLAR_TAG = '$$'
const BLOCK_OPEN = '/*'
const BLOCK_CLOSE = '*/'
const EXECUTABLE_OPEN = '/*!'
const DASHES = '--'
const HASH = '#'
const NEWLINE = '\n'
const SEMICOLON = ';'
// MySQL starts a -- comment only when a space or a control character follows the dashes.
const LAST_CONTROL_CHARACTER = ' '
const PAIR_LENGTH = 2

function closed(kind: TokenKind, end: number): Scan {
  return { kind, end, isOpen: false }
}

// Without its closer, a token runs to the end of the text.
function closedOrOpen(kind: TokenKind, text: string, end: number): Scan {
  return end === -1 ? { kind, end: text.length, isOpen: true } : closed(kind, end)
}

function matched(kind: TokenKind, pattern: StickyPattern): Scanner {
  return (text, start) => {
    const end = pattern.endAt(text, start)
    return end === undefined ? undefined : closed(kind, end)
  }
}

// Finds the next character that can end the quoted text: the quote, or a backslash when the string
// reads escapes.
function stopFinder(quote: string, isEscaping: boolean): (text: string, from: number) => number {
  const stops = isEscaping ? ESCAPING_STOPS.get(quote) : undefined
  if (stops === undefined) {
    return (text, from) => text.indexOf(quote, from)
  }
  return (text, from) => {
    stops.lastIndex = from
    return stops.exec(text)?.index ?? -1
  }
}

// The end of the quoted text opened at `quoteAt`, or -1 when it is not closed. A doubled quote and
// a backslash with the character after it (when the string reads escapes) do not close it.
function quoteEnd(text: string, quoteAt: number, isEscaping: boolean): number {
  const quote = text.charAt(quoteAt)
  const nextStop = stopFinder(quote, isEscaping)
  for (let stop = nextStop(text, quoteAt + 1); stop !== -1;) {
    const isPair = text.charAt(stop) !== quote || text.charAt(stop + 1) === quote
    if (!isPair) {
      return stop + 1
    }
    stop = nextStop(text, stop + PAIR_LENGTH)
  }
  return -1
}

function startsLineComment(text: string, start: number, rules: LexicalRules): boolean {
  if (rules.hasHashComments && text.startsWith(HASH, start)) {
    return true
  }
  if (!text.startsWith(DASHES, start)) {
    return false
  }
  return (
    !rules.hasSpacedDashComments || text.charAt(start + DASHES.length) <= LAST_CONTROL_CHARACTER
  )
}

const scanLineComment: Scanner = (text, start, rules) => {
  if (!startsLineComment(text, start, rules)) {
    return undefined
  }
  const newline = text.indexOf(NEWLINE, start)
  return closed(TokenKind.LineComment, newline === -1 ? text.length : newline)
}

function flatCommentEnd(text: string, start: number): number {
  const close = text.indexOf(BLOCK_CLOSE, start + BLOCK_OPEN.length)
  return close === -1 ? -1 : close + BLOCK_CLOSE.length
}

// Counts the comments opened inside the one at `start`, which is open already.
function nestedCommentEnd(text: string, start: number): number {
  let depth = 1
  COMMENT_MARK.lastIndex = start + BLOCK_OPEN.length
  for (let mark = COMMENT_MARK.exec(text); mark !== null; mark = COMMENT_MARK.exec(text)) {
    depth += mark[0] === BLOCK_OPEN ? 1 : -1
    if (depth === 0) {
      return COMMENT_MARK.lastIndex
    }
  }
  return -1
}

function blockCommentKind(text: string, start: number, rules: LexicalRules): TokenKind {
  return rules.hasExecutableComments && text.startsWith(EXECUTABLE_OPEN, start)
    ? TokenKind.ExecutableComment
    : TokenKind.BlockComment
}

const scanBlockComment: Scanner = (text, start, rules) => {
  if (!text.startsWith(BLOCK_OPEN, start)) {
    return undefined
  }
  const end = rules.hasNestedComments ? nestedCommentEnd(text, start) : flatCommentEnd(text, start)
  return closedOrOpen(blockCommentKind(text, start, rules), text, end)
}

function dollarTagEnd(text: string, start: number): number | undefined {
  return text.startsWith(EMPTY_DOLLAR_TAG, start)
    ? start + EMPTY_DOLLAR_TAG.length
    : DOLLAR_TAG.endAt(text, start)
}

const scanDollarString: Scanner = (text, start, rules) => {
  const tagEnd = rules.hasDollarQuotes ? dollarTagEnd(text, start) : undefined
  if (tagEnd === undefined) {
    return undefined
  }
  const tag = text.slice(start, tagEnd)
  const close = text.indexOf(tag, tagEnd)
  return closedOrOpen(TokenKind.String, text, close === -1 ? -1 : close + tag.length)
}

const scanEscapeString: Scanner = (text, start, rules) =>
  rules.hasEscapeStrings && ESCAPE_STRING.endAt(text, start) !== undefined
    ? closedOrOpen(TokenKind.String, text, quoteEnd(text, start + 1, true))
    : undefined

const scanString: Scanner = (text, start, rules) =>
  rules.stringQuotes.includes(text.charAt(start))
    ? closedOrOpen(TokenKind.String, text, quoteEnd(text, start, rules.hasBackslashEscapes))
    : undefined

const scanQuotedIdentifier: Scanner = (text, start, rules) =>
  rules.identifierQuotes.includes(text.charAt(start))
    ? closedOrOpen(TokenKind.QuotedIdentifier, text, quoteEnd(text, start, false))
    : undefined

const scanNumber: Scanner = (text, start) => {
  const end = DIGITS.endAt(text, start)
  return end === undefined ? undefined : closed(TokenKind.Number, EXPONENT.endAt(text, end) ?? end)
}

const scanSemicolon: Scanner = (text, start) =>
  text.charAt(start) === SEMICOLON ? closed(TokenKind.Semicolon, start + 1) : undefined

// In order: the first scanner that recognizes the text at a position makes the token.
export const SCANNERS: readonly Scanner[] = [
  matched(TokenKind.Whitespace, WHITESPACE),
  scanLineComment,
  scanBlockComment,
  scanDollarString,
  scanEscapeString,
  scanString,
  scanQuotedIdentifier,
  matched(TokenKind.Parameter, PARAMETER),
  scanNumber,
  matched(TokenKind.Word, WORD),
  scanSemicolon,
]
