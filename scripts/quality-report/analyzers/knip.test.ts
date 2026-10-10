import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeKnip } from './knip.ts'

const ISSUES = `Unused devDependencies (1)
lefthook  package.json:89:6
Unused exports (2)
parseFragment  function  scripts/quality-report/fragment.ts:26:17
MARKER                   scripts/quality-report/render.ts:6:14
Configuration hints (1)
scripts/*.ts  knip.jsonc  Refine entry pattern (no matches)`

function knip(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Knip, exitCode, output, seconds: 1 }
}

describe('analyzeKnip', () => {
  it('should be ok without unused code', () => {
    expect(analyzeKnip(knip('✂️  Excellent, Knip found no issues.', 0))).toStrictEqual({
      status: Status.Ok,
      summary: 'No unused files, exports or dependencies',
    })
  })

  it('should count every kind of issue', () => {
    const sut = analyzeKnip(knip(ISSUES, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe('1 unused devDependencies, 2 unused exports, 1 configuration hints')
    expect(sut.details?.body).toBe(ISSUES)
  })

  it('should say knip failed when it reports no issue group', () => {
    expect(analyzeKnip(knip('Error: cannot read knip.jsonc', 2)).summary).toBe('knip failed')
  })
})
