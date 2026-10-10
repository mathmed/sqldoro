import { describe, expect, it } from 'vitest'

import {
  formatResultLine,
  hasReachedMinScore,
  MUTATION_RESULT_PREFIX,
  type MutationResult,
  parseResultLine,
} from './mutation-result.ts'

const RESULT: MutationResult = {
  isSkipped: false,
  reason: '',
  score: 87.5,
  minScore: 95,
  killed: 7,
  total: 8,
  ignored: 1,
  files: [{ file: 'src/core/a.ts', total: 8, killed: 7, score: 87.5 }],
  survivors: [
    {
      file: 'src/core/a.ts',
      line: 3,
      mutator: 'ConditionalExpression',
      replacement: 'true',
      status: 'Survived',
    },
  ],
}

describe('mutation result line', () => {
  it('should round-trip through the output of the mutation script', () => {
    const output = `Stryker output\n${formatResultLine(RESULT)}\nmore output`

    expect(parseResultLine(output)).toEqual(RESULT)
  })

  it('should start with the prefix the Quality Report looks for', () => {
    expect(formatResultLine(RESULT).startsWith(MUTATION_RESULT_PREFIX)).toBe(true)
  })

  it('should be missing when the script died before printing it', () => {
    expect(parseResultLine('Error: Stryker crashed')).toBeUndefined()
  })

  it('should reject a line without the expected fields', () => {
    expect(() => parseResultLine(`${MUTATION_RESULT_PREFIX}{"score": 1}`)).toThrow(TypeError)
  })
})

describe('hasReachedMinScore', () => {
  it.each([
    [94.9, false],
    [95, true],
    [100, true],
  ])('should compare a score of %d with the minimum of 95', (score, isReached) => {
    expect(hasReachedMinScore({ ...RESULT, score })).toBe(isReached)
  })
})
