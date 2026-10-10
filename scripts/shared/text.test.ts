import { describe, expect, it } from 'vitest'

import { cleanOutput, compareText, linesMatching, orElse, plural, tail } from './text.ts'

describe('plural', () => {
  it.each([
    [0, '0 files'],
    [1, '1 file'],
    [2, '2 files'],
  ])('should pick the form for %i', (count, expected) => {
    expect(plural(count, 'file', 'files')).toBe(expected)
  })
})

describe('cleanOutput', () => {
  it('should drop colors, npm noise and surrounding blank lines but keep indentation', () => {
    const output = [
      '',
      '> sqldoro@0.0.1 lint',
      '> eslint .',
      '',
      '  \u001b[31mindented line\u001b[39m   ',
      'npm error code 1',
      'npm ERR! old npm',
      'last line',
      '',
      '',
    ].join('\n')

    expect(cleanOutput(output)).toBe('  indented line\nlast line')
  })

  it('should return nothing for blank output', () => {
    expect(cleanOutput('\n  \n')).toBe('')
  })
})

describe('tail', () => {
  it('should keep text within the limit untouched', () => {
    expect(tail('abcdef', 6)).toBe('abcdef')
  })

  it('should keep the end of longer text and say it was truncated', () => {
    expect(tail('abcdef', 2)).toBe('[...truncated...]\nef')
  })
})

describe('linesMatching', () => {
  it('should keep only the matching lines', () => {
    expect(linesMatching(/^error/, 'error a\nok\nerror b')).toEqual(['error a', 'error b'])
  })
})

describe('orElse', () => {
  it('should fall back only when the text is empty', () => {
    expect(orElse('', 'fallback')).toBe('fallback')
    expect(orElse('text', 'fallback')).toBe('text')
  })
})

describe('compareText', () => {
  it('should sort text alphabetically', () => {
    expect(['b', 'c', 'a'].toSorted(compareText)).toEqual(['a', 'b', 'c'])
  })
})
