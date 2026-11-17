import { Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

import { conventions } from './conventions.ts'

function jsdocLines(source: string): number[] {
  const linter = new Linter({ configType: 'flat' })
  const messages = linter.verify(
    source,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser },
        plugins: { conventions },
        rules: { 'conventions/no-jsdoc': 'error' },
      },
    ],
    'module.ts',
  )
  return messages.map((message) => message.line)
}

describe('conventions/no-jsdoc', () => {
  it('should report every JSDoc block, on one line or several', () => {
    const source = [
      '/** Adds two numbers. */',
      'export function add(a: number, b: number): number {',
      '  return a + b',
      '}',
      '/**',
      ' * @param value the value',
      ' */',
      'export const value = 1',
      '/** @public */ export const kept = 2',
    ].join('\n')

    expect(jsdocLines(source)).toEqual([1, 5, 9])
  })

  it('should accept line comments, plain block comments and empty ones', () => {
    const source = [
      '// Why: the server rounds otherwise.',
      '/* the reason */',
      '/*',
      '   a longer reason',
      '*/',
      '/**/',
      "const text = '/** not a comment */'",
    ].join('\n')

    expect(jsdocLines(source)).toEqual([])
  })
})
