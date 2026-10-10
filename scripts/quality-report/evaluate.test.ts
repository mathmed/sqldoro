import { describe, expect, it, vi } from 'vitest'

import { Analysis } from './analysis.ts'
import { evaluate, type Evidence } from './evaluate.ts'
import { finding } from './finding.ts'
import type { Fragment } from './fragment.ts'
import { Job, type Section } from './sections.ts'
import { Status } from './status.ts'

const BUILD: Fragment = { analysis: Analysis.Build, exitCode: 0, output: 'built', seconds: 1.5 }

const SMOKE_SECTION: Section = {
  title: 'Extension smoke (VS Code)',
  checks: [
    {
      analysis: Analysis.Build,
      job: Job.Smoke,
      label: 'build',
      analyze: (fragment) => finding(Status.Ok, `analysed ${fragment.output}`),
    },
    {
      analysis: Analysis.Smoke,
      job: Job.Smoke,
      label: 'VS Code',
      analyze: () => finding(Status.Ok, 'activated'),
    },
  ],
}

function evidence(jobResults: Record<string, string>): Evidence {
  return {
    fragments: new Map([[Analysis.Build, BUILD]]),
    jobResults: new Map(Object.entries(jobResults)),
  }
}

describe('evaluate', () => {
  it('should analyse the fragments and take the worst status of the section', () => {
    const sut = evaluate(SMOKE_SECTION, evidence({ smoke: 'failure' }))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.results.map(({ finding: { summary }, seconds }) => [summary, seconds])).toEqual([
      ['analysed built', 1.5],
      ['Job `smoke` ended as `failure` before running this analysis', 0],
    ])
  })

  it.each([
    [{}, Status.Skipped, 'Job `smoke` did not run: analysis not run'],
    [{ smoke: 'cancelled' }, Status.Skipped, 'Job `smoke` was cancelled: analysis not run'],
    [{ smoke: 'skipped' }, Status.Skipped, 'Job `smoke` was skipped: analysis not run'],
    [{ smoke: 'success' }, Status.Warning, 'Job `smoke` passed but did not upload this result'],
  ])('should explain a missing fragment when the job results are %j', (jobs, status, summary) => {
    const [, missing] = evaluate(SMOKE_SECTION, evidence(jobs)).results

    expect(missing?.finding).toStrictEqual({ status, summary })
  })

  it.each([new SyntaxError('bad JSON'), new TypeError('missing field')])(
    'should fall back to the exit code when the analyzer cannot read the output (%s)',
    (error) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const broken: Section = {
        title: 'Mutation testing (Stryker)',
        checks: [
          {
            analysis: Analysis.Build,
            job: Job.Smoke,
            label: 'build',
            analyze: () => {
              throw error
            },
          },
        ],
      }
      const failed: Evidence = {
        fragments: new Map([[Analysis.Build, { ...BUILD, exitCode: 2 }]]),
        jobResults: new Map(),
      }

      expect(evaluate(broken, evidence({})).results[0]?.finding.summary).toBe(
        'passed; the output could not be summarised',
      )
      expect(evaluate(broken, failed).results[0]?.finding).toStrictEqual({
        status: Status.Failed,
        summary: 'failed (exit code 2); the output could not be summarised',
        details: { title: 'Output', body: 'built', format: 'text' },
      })
    },
  )

  it('should not hide a bug in an analyzer', () => {
    const buggy: Section = {
      title: 'Lint',
      checks: [
        {
          analysis: Analysis.Build,
          job: Job.Smoke,
          label: 'build',
          analyze: () => {
            throw new RangeError('bug')
          },
        },
      ],
    }

    expect(() => evaluate(buggy, evidence({}))).toThrow(RangeError)
  })
})
