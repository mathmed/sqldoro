import { describe, expect, it } from 'vitest'

import {
  fixText,
  formatProblem,
  isBinary,
  largeFileProblem,
  MAX_ADDED_FILE_BYTES,
  textProblems,
} from './rules.ts'

describe('isBinary', () => {
  it('should treat a file with a NUL byte among its first bytes as binary', () => {
    expect(isBinary(new Uint8Array([0x89, 0x50, 0x00, 0x47]))).toBe(true)
    expect(isBinary(new TextEncoder().encode('plain text\n'))).toBe(false)
  })

  it('should only look at the first 8000 bytes, as git does', () => {
    const bytes = new Uint8Array(8001).fill(0x61)
    bytes[8000] = 0

    expect(isBinary(bytes)).toBe(false)
    bytes[7999] = 0
    expect(isBinary(bytes)).toBe(true)
  })
})

describe('textProblems', () => {
  it('should accept a clean text and an empty file', () => {
    expect(textProblems('a.md', 'one\ntwo\n')).toStrictEqual([])
    expect(textProblems('a.md', '')).toStrictEqual([])
  })

  it('should report each line that ends with spaces or tabs', () => {
    expect(textProblems('a.md', 'one \ntwo\nthree\t\n')).toStrictEqual([
      { path: 'a.md', line: 1, message: 'trailing whitespace' },
      { path: 'a.md', line: 3, message: 'trailing whitespace' },
    ])
  })

  it('should report a missing final newline', () => {
    expect(textProblems('Makefile', 'all:')).toStrictEqual([
      { path: 'Makefile', line: undefined, message: 'no newline at the end of the file' },
    ])
  })

  it('should report blank lines at the end, and a file of blank lines', () => {
    const blankEnd = [{ path: 'a', line: undefined, message: 'blank lines at the end of the file' }]

    expect(textProblems('a', 'one\n\n')).toStrictEqual(blankEnd)
    expect(textProblems('a', '\n')).toStrictEqual(blankEnd)
  })
})

describe('fixText', () => {
  it('should strip the trailing whitespace of every line', () => {
    expect(fixText('one  \ntwo\t\nthree\n')).toBe('one\ntwo\nthree\n')
  })

  it('should end the text with exactly one newline', () => {
    expect(fixText('one')).toBe('one\n')
    expect(fixText('one\n\n\n')).toBe('one\n')
  })

  it('should leave an empty text, or one of blank lines, empty', () => {
    expect(fixText('')).toBe('')
    expect(fixText('\n \n')).toBe('')
  })

  it('should keep the indentation and the blank lines inside the text', () => {
    expect(fixText('  one\n\n  two\n')).toBe('  one\n\n  two\n')
  })
})

describe('largeFileProblem', () => {
  it('should accept a file up to 500 KB', () => {
    expect(largeFileProblem('a.png', MAX_ADDED_FILE_BYTES)).toBeUndefined()
  })

  it('should refuse a larger file, with its size', () => {
    expect(largeFileProblem('a.png', MAX_ADDED_FILE_BYTES + 1)).toStrictEqual({
      path: 'a.png',
      line: undefined,
      message: '500kb added, above the 500kb limit',
    })
    expect(largeFileProblem('b.zip', 2 * 1024 * 1024)?.message).toBe(
      '2mb added, above the 500kb limit',
    )
  })
})

describe('formatProblem', () => {
  it('should name the line of a problem that has one', () => {
    expect(formatProblem({ path: 'a.md', line: 3, message: 'trailing whitespace' })).toBe(
      'a.md:3: trailing whitespace',
    )
    expect(formatProblem({ path: 'a.md', line: undefined, message: 'x' })).toBe('a.md: x')
  })
})
