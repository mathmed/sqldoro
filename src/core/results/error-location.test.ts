import { describe, expect, it } from 'vitest'

import { ErrorLocationKind } from '../engine/query-error.ts'
import { locateError } from './error-location.ts'

function offset(statement: string, characters: number): string {
  const range = locateError({ kind: ErrorLocationKind.Offset, offset: characters }, statement)
  return `${String(range.start)}-${String(range.end)}`
}

function line(statement: string, number: number, near: string): ReturnType<typeof locateError> {
  return locateError({ kind: ErrorLocationKind.Line, line: number, near }, statement)
}

describe('locateError', () => {
  it('should cover the word at the character PostgreSQL pointed at', () => {
    expect(offset('SELECT * FORM t', 9)).toBe('9-13')
    expect(offset('SELECT 1 +', 9)).toBe('9-10')
  })

  it('should count characters beyond the first plane as one', () => {
    expect(offset("SELECT '😀', FORM", 12)).toBe('13-17')
  })

  it('should point at the end when the character is past the text or on a space', () => {
    expect(offset('SELECT', 6)).toBe('6-6')
    expect(offset('SELECT', 60)).toBe('6-6')
    expect(offset('a  b', 1)).toBe('1-1')
  })

  it('should find the text MySQL quoted, from the line it gave', () => {
    const statement = 'SELECT a\nFORM t\nWHERE FORM = 1'

    expect(line(statement, 2, 'FORM t\nWHERE FORM = 1')).toStrictEqual({ start: 9, end: 13 })
    expect(line(statement, 3, 'FORM = 1')).toStrictEqual({ start: 22, end: 26 })
  })

  it('should cover the whole line when the quoted text is missing or not found', () => {
    const statement = 'SELECT a\nFROM t\r\nWHERE x'

    expect(line(statement, 2, '')).toStrictEqual({ start: 9, end: 16 })
    expect(line(statement, 3, 'zzz')).toStrictEqual({ start: 17, end: 24 })
  })

  it('should keep the line inside the statement', () => {
    expect(line('SELECT a\nFROM t', 9, '')).toStrictEqual({ start: 9, end: 15 })
    expect(line('SELECT a\nFROM t', 0, '')).toStrictEqual({ start: 0, end: 8 })
  })

  it('should look for the start of a long quoted text only', () => {
    const near = `${'x'.repeat(40)}TRUNCATED`

    expect(line(`SELECT ${'x'.repeat(40)}y`, 1, near)).toStrictEqual({ start: 7, end: 48 })
  })
})
