import { describe, expect, it } from 'vitest'

import type { MutationResult } from '../shared/mutation-result.ts'
import { renderSummary } from './summary.ts'

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

describe('renderSummary', () => {
  it('should show the score, the verdict and the counts', () => {
    expect(renderSummary(RESULT)).toBe(
      [
        '## Mutation testing',
        '',
        '**Score: 100.0%** (minimum 95%, ✅ passed)',
        '',
        '| Killed 🎉 | Survived 🙁 | Ignored | Total |',
        '| ---: | ---: | ---: | ---: |',
        '| 4 | 0 | 0 | 4 |',
        '',
      ].join('\n'),
    )
  })

  it('should list every survivor when the score is below the minimum', () => {
    const survivor = {
      file: 'src/core/greeting.ts',
      line: 5,
      mutator: 'StringLiteral',
      replacement: '"a|b"',
      status: 'Survived',
    }

    const summary = renderSummary({ ...RESULT, score: 75, killed: 3, survivors: [survivor] })

    expect(summary).toContain('**Score: 75.0%** (minimum 95%, ❌ failed)')
    expect(summary).toContain('### Survivors')
    expect(summary).toContain('| `src/core/greeting.ts:5` | StringLiteral | `"a\\|b"` | Survived |')
    expect(summary).toContain('add the missing assertion')
  })

  it('should explain why nothing was mutated', () => {
    const skipped = {
      ...RESULT,
      isSkipped: true,
      reason: 'No core file changed: nothing to mutate.',
    }

    expect(renderSummary(skipped)).toBe(
      '## Mutation testing\n\nNo core file changed: nothing to mutate.\n',
    )
  })
})
