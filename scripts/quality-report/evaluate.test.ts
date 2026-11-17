import { describe, expect, it, vi } from 'vitest'

import { Analysis } from './analysis.ts'
import {
  checkDetail,
  evaluate,
  type Evidence,
  isInherited,
  isSectionInherited,
} from './evaluate.ts'
import { finding, withMetric } from './finding.ts'
import type { Fragment } from './fragment.ts'
import { type Check, Group, Job, type Section } from './sections.ts'
import { Status } from './status.ts'

const BUILD: Fragment = { analysis: Analysis.Build, exitCode: 0, output: 'built', seconds: 1.5 }

const SECTION = { group: Group.Behavior, reproduce: 'make smoke' }

const BUILD_CHECK: Check = {
  analysis: Analysis.Build,
  job: Job.Smoke,
  label: 'build',
  analyze: (fragment) => finding(Status.Ok, `analysed ${fragment.output}`),
}

const SMOKE_SECTION: Section = {
  ...SECTION,
  title: 'Extension smoke (VS Code)',
  checks: [
    BUILD_CHECK,
    {
      analysis: Analysis.Smoke,
      job: Job.Smoke,
      label: 'VS Code',
      analyze: () => finding(Status.Ok, 'activated'),
    },
  ],
}

function evidence(
  jobResults: Record<string, string>,
  baseFragments: ReadonlyMap<Analysis, Fragment> = new Map(),
): Evidence {
  return {
    fragments: new Map([[Analysis.Build, BUILD]]),
    jobResults: new Map(Object.entries(jobResults)),
    baseFragments,
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
        ...SECTION,
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
        baseFragments: new Map(),
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
      ...SECTION,
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

  it('should analyse the fragment of the base branch with the same check', () => {
    const base = new Map([[Analysis.Build, { ...BUILD, output: 'main' }]])

    const [build, smoke] = evaluate(SMOKE_SECTION, evidence({ smoke: 'success' }, base)).results

    expect(build?.base).toStrictEqual(finding(Status.Ok, 'analysed main'))
    expect(smoke?.base).toBeUndefined()
  })
})

describe('inheritance', () => {
  const failed = finding(Status.Failed, 'x')

  function result(current: typeof failed, base?: typeof failed): Parameters<typeof isInherited>[0] {
    return { check: BUILD_CHECK, finding: current, base, seconds: 0 }
  }

  it('should call a failure inherited when the base branch failed the same check', () => {
    expect(isInherited(result(failed, failed))).toBe(true)
    expect(isInherited(result(failed, finding(Status.Ok, 'y')))).toBe(false)
    expect(isInherited(result(failed))).toBe(false)
    expect(isInherited(result(finding(Status.Ok, 'y'), failed))).toBe(false)
  })

  it('should call a section inherited when every failure of it is', () => {
    const section = (
      results: Parameters<typeof isInherited>[0][],
    ): Parameters<typeof isSectionInherited>[0] => ({
      section: SMOKE_SECTION,
      status: Status.Failed,
      results,
    })

    expect(
      isSectionInherited(section([result(failed, failed), result(finding(Status.Ok, 'y'))])),
    ).toBe(true)
    expect(isSectionInherited(section([result(failed, failed), result(failed)]))).toBe(false)
    expect(isSectionInherited(section([result(finding(Status.Ok, 'y'), failed)]))).toBe(false)
  })
})

describe('checkDetail', () => {
  const metric = { label: 'score', value: 96, unit: '%', decimals: 1 }

  it('should be the summary of a finding without a metric', () => {
    expect(
      checkDetail({
        check: BUILD_CHECK,
        finding: finding(Status.Ok, 'fine'),
        base: undefined,
        seconds: 0,
      }),
    ).toBe('fine')
  })

  it('should compare the metric with the one of the base branch', () => {
    const current = withMetric(finding(Status.Ok, '10 killed'), metric)
    const base = withMetric(finding(Status.Ok, ''), { ...metric, value: 95 })

    expect(checkDetail({ check: BUILD_CHECK, finding: current, base, seconds: 0 })).toBe(
      '10 killed · score 96.0% (↑1.0)',
    )
    expect(
      checkDetail({
        check: BUILD_CHECK,
        finding: current,
        base: finding(Status.Ok, ''),
        seconds: 0,
      }),
    ).toBe('10 killed · score 96.0% (n/a)')
  })
})
