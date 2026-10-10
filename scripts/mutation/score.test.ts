import type { MutantResult } from '@stryker-mutator/api/core'
import { describe, expect, it } from 'vitest'

import { scoreMutants, skippedResult } from './score.ts'

const ROOT = '/repo'

function mutant(overrides: Partial<MutantResult>): MutantResult {
  return {
    id: '1',
    fileName: '/repo/src/core/greeting.ts',
    mutatorName: 'StringLiteral',
    replacement: '""',
    location: { start: { line: 1, column: 22 }, end: { line: 1, column: 31 } },
    status: 'Killed',
    ...overrides,
  }
}

describe('scoreMutants', () => {
  it('should score killed and timed out mutants against every valid mutant', () => {
    const mutants = [
      mutant({ status: 'Killed' }),
      mutant({ status: 'Timeout' }),
      mutant({
        status: 'Survived',
        location: { start: { line: 6, column: 10 }, end: { line: 6, column: 40 } },
      }),
      mutant({
        status: 'NoCoverage',
        fileName: 'src/core/guards.ts',
        mutatorName: 'BlockStatement',
        replacement: '{}',
      }),
      mutant({ status: 'CompileError' }),
      mutant({ status: 'RuntimeError' }),
      mutant({ status: 'Ignored' }),
      mutant({ status: 'Pending' }),
    ]

    const sut = scoreMutants(mutants, { minScore: 95, root: ROOT })

    expect(sut).toStrictEqual({
      isSkipped: false,
      reason: '',
      score: 50,
      minScore: 95,
      killed: 2,
      total: 4,
      ignored: 1,
      files: [
        { file: 'src/core/greeting.ts', total: 3, killed: 2, score: (2 / 3) * 100 },
        { file: 'src/core/guards.ts', total: 1, killed: 0, score: 0 },
      ],
      survivors: [
        {
          file: 'src/core/greeting.ts',
          line: 6,
          mutator: 'StringLiteral',
          replacement: '""',
          status: 'Survived',
        },
        {
          file: 'src/core/guards.ts',
          line: 1,
          mutator: 'BlockStatement',
          replacement: '{}',
          status: 'NoCoverage',
        },
      ],
    })
  })

  it('should give a perfect score when there is no valid mutant', () => {
    const sut = scoreMutants([mutant({ status: 'CompileError' })], { minScore: 95, root: ROOT })

    expect(sut.score).toBe(100)
    expect(sut.total).toBe(0)
    expect(sut.files).toEqual([])
  })
})

describe('skippedResult', () => {
  it('should pass with nothing mutated', () => {
    expect(skippedResult('No core file changed', 90)).toStrictEqual({
      isSkipped: true,
      reason: 'No core file changed',
      score: 100,
      minScore: 90,
      killed: 0,
      total: 0,
      ignored: 0,
      files: [],
      survivors: [],
    })
  })
})
