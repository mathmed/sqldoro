import { type ErrorLocation, ErrorLocationKind } from '../engine/query-error.ts'

// Offsets in a statement, the end excluded.
export interface TextRange {
  readonly start: number
  readonly end: number
}

const WORD = /[\w$\u0080-￿]+|\S/y
const NEWLINE = '\n'
// MySQL quotes the rest of the statement from where it stopped: its start is enough to find it.
const NEAR_LENGTH = 40

// Where an error is in the statement: the word at the character PostgreSQL pointed at, or the text
// MySQL quoted on the line it gave (the whole line when the text is not there).
export function locateError(location: ErrorLocation, statement: string): TextRange {
  return location.kind === ErrorLocationKind.Offset
    ? wordAt(statement, codeUnitOffset(statement, location.offset))
    : nearOnLine(statement, location.line, location.near)
}

// PostgreSQL counts characters; JavaScript strings count UTF-16 code units.
function codeUnitOffset(text: string, characters: number): number {
  let offset = 0
  let counted = 0
  for (const character of text) {
    if (counted >= characters) {
      break
    }
    offset += character.length
    counted += 1
  }
  return offset
}

function wordAt(text: string, offset: number): TextRange {
  WORD.lastIndex = offset
  return WORD.test(text) ? { start: offset, end: WORD.lastIndex } : { start: offset, end: offset }
}

function nearOnLine(statement: string, line: number, near: string): TextRange {
  const range = lineRange(statement, line)
  const needle = upTo(near, NEWLINE).slice(0, NEAR_LENGTH)
  const found = needle === '' ? -1 : statement.indexOf(needle, range.start)
  return found === -1 ? range : wordAt(statement, found)
}

// MySQL counts lines from 1, by line feeds; a line past the end is the last one.
function lineRange(text: string, line: number): TextRange {
  const lines = text.split(NEWLINE)
  const index = Math.min(Math.max(line, 1), lines.length) - 1
  const start = lines.slice(0, index).reduce((offset, current) => offset + current.length + 1, 0)
  return { start, end: start + upTo(text.slice(start), NEWLINE).length }
}

function upTo(text: string, separator: string): string {
  const end = text.indexOf(separator)
  return end === -1 ? text : text.slice(0, end)
}
