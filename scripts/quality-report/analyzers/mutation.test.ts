import { describe, expect, it } from 'vitest'

import {
  formatResultLine,
  type MutationResult,
  type Survivor,
} from '../../shared/mutation-result.ts'
import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeMutation } from './mutation.ts'

const SURVIVOR: Survivor = {
  file: 'src/core/guards.ts',
  line: 12,
  mutator: 'ConditionalExpression',
  replacement: 'a | `b`\n  c',
  status: 'Survived',
}

const RESULT: MutationResult = {
  isSkipped: false,
  reason: '',
  score: 100,
  minScore: 95,
  killed: 4,
  total: 4,
  ignored: 0,
  files: [{ file: 'src/core/greeting.ts', total: 4, killed: 4, score: 100 }],
  survivors: [],
}

function mutation(result: MutationResult, exitCode = 0): Fragment {
  return {
    analysis: Analysis.Mutation,
    exitCode,
    output: `Stryker progress\n${formatResultLine(result)}`,
    seconds: 9,
  }
}

describe('analyzeMutation', () => {
  it('should report the score against the ratchet', () => {
    const sut = analyzeMutation(mutation(RESULT))

    expect(sut.status).toBe(Status.Ok)
    expect(sut.summary).toBe(
      'score 100.0% (ratchet 95%) · 4 of 4 mutants killed · 0 survivors in 1 mutated file',
    )
    expect(sut.details?.body).toBe(
      [
        '| File | Mutants | Killed | Score |',
        '| --- | ---: | ---: | ---: |',
        '| `src/core/greeting.ts` | 4 | 4 | 100.0% |',
      ].join('\n'),
    )
  })

  it('should fail below the ratchet and list the survivors', () => {
    const result = { ...RESULT, score: 80, killed: 4, total: 5, survivors: [SURVIVOR] }

    const sut = analyzeMutation(mutation(result, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toContain('1 survivor in 1 mutated file')
    expect(sut.details?.body).toContain(
      "| `src/core/guards.ts:12` | ConditionalExpression | `a \\| 'b' c` | Survived |",
    )
    expect(sut.details?.body).toContain('make mutation-changed')
  })

  it('should cap the listed survivors and shorten long replacements', () => {
    const replacement = 'x'.repeat(100)
    const survivors = Array.from(Array(32).keys(), (line) => ({ ...SURVIVOR, line, replacement }))

    const body = analyzeMutation(mutation({ ...RESULT, score: 10, survivors }, 1)).details?.body

    expect(body).toContain(`\`${'x'.repeat(80)}…\``)
    expect(body).toContain('`src/core/guards.ts:29`')
    expect(body).not.toContain('`src/core/guards.ts:30`')
    expect(body).toContain('... and 2 more in the `mutation` job summary.')
  })

  it('should mention the mutants ignored by Stryker disable comments', () => {
    expect(analyzeMutation(mutation({ ...RESULT, ignored: 2 })).summary).toContain(
      '· 2 mutants ignored by `Stryker disable`',
    )
  })

  it('should skip when no core file changed', () => {
    const skipped = {
      ...RESULT,
      isSkipped: true,
      reason: 'No core file changed: nothing to mutate.',
    }

    expect(analyzeMutation(mutation(skipped))).toStrictEqual({
      status: Status.Skipped,
      summary: 'No core file changed: nothing to mutate.',
    })
  })

  it('should fail when Stryker died before producing a score', () => {
    const fragment: Fragment = {
      analysis: Analysis.Mutation,
      exitCode: 1,
      output: 'Error: Initial test run failed',
      seconds: 3,
    }

    const sut = analyzeMutation(fragment)

    expect(sut.summary).toBe('Stryker failed before producing a score')
    expect(sut.details?.body).toBe('Error: Initial test run failed')
  })
})
