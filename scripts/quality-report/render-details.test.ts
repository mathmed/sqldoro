import { describe, expect, it } from 'vitest'

import { Analysis } from './analysis.ts'
import type { CheckResult, SectionResult } from './evaluate.ts'
import { finding, type Finding, markdownDetails, textDetails } from './finding.ts'
import { passedDetails, problems } from './render-details.ts'
import { Group, Job } from './sections.ts'
import { Status, worst } from './status.ts'

const LIMIT = 6000

interface Check {
  readonly current: Finding
  readonly base?: Finding
  readonly seconds?: number
}

function section(title: string, checks: readonly Check[]): SectionResult {
  const results = checks.map(({ current, base, seconds = 0 }, index): CheckResult => ({
    check: {
      analysis: Analysis.Eslint,
      job: Job.Lint,
      label: `check ${String(index)}`,
      analyze: () => current,
    },
    finding: current,
    base,
    seconds,
  }))
  const checksOf = results.map(({ check }) => check)
  return {
    section: {
      group: Group.Code,
      title,
      reproduce: `make ${title.toLowerCase()}`,
      checks: checksOf,
    },
    status: worst(checks.map(({ current }) => current.status)),
    results,
  }
}

describe('problems', () => {
  it('should open the failures, then the warnings, each with how to reproduce it', () => {
    const results = [
      section('Knip', [{ current: finding(Status.Warning, 'passed without a result') }]),
      section('Types', [
        {
          current: finding(Status.Failed, '1 type error', textDetails('Errors', 'a.ts: TS1')),
          seconds: 3.04,
        },
      ]),
      section('Lint', [{ current: finding(Status.Ok, 'fine') }]),
    ]

    expect(problems(results, 'main', LIMIT)).toEqual([
      '',
      '### ❌ Types',
      '',
      '1 type error _(3.0s)_',
      '',
      '```text\na.ts: TS1\n```',
      '',
      '**Reproduce**: `make types`',
      '',
      '### ⚠️ Knip',
      '',
      'passed without a result',
      '',
      '**Reproduce**: `make knip`',
    ])
  })

  it('should only show the checks of a section that need attention, by their label', () => {
    const results = [
      section('Security', [
        { current: finding(Status.Ok, 'No security problems') },
        {
          current: finding(Status.Failed, '2 vulnerabilities'),
          base: finding(Status.Failed, '1 vulnerability'),
        },
      ]),
    ]

    expect(problems(results, 'main', LIMIT)).toContain(
      '**check 1**: 2 vulnerabilities · inherited from `main`',
    )
    expect(problems(results, 'main', LIMIT).join('\n')).not.toContain('No security problems')
  })

  it('should embed Markdown details as they are, and fence the rest so output cannot close it', () => {
    const results = [
      section('Mutation', [
        { current: finding(Status.Failed, 'score 90%', markdownDetails('Survivors', '| a |')) },
      ]),
      section('Lint', [
        { current: finding(Status.Failed, 'x', textDetails('Output', '```\nevil')) },
      ]),
    ]

    const lines = problems(results, 'main', LIMIT)

    expect(lines).toContain('| a |')
    expect(lines).toContain("```text\n'''\nevil\n```")
  })

  it('should fence Markdown details too long to embed, and drop details at the zero limit', () => {
    const results = [
      section('Mutation', [
        { current: finding(Status.Failed, 'x', markdownDetails('Survivors', 's'.repeat(20))) },
      ]),
    ]

    expect(problems(results, 'main', 10)).toContain('```text\n[...truncated...]\nssssssssss\n```')
    expect(problems(results, 'main', 0)).toEqual([
      '',
      '### ❌ Mutation',
      '',
      'x',
      '',
      '**Reproduce**: `make mutation`',
    ])
  })
})

describe('passedDetails', () => {
  it('should fold the details of the passing checks in one block', () => {
    const results = [
      section('Mutation', [
        { current: finding(Status.Ok, 'score 100%', markdownDetails('Mutated files', '| f |')) },
      ]),
      section('Types', [{ current: finding(Status.Ok, 'No type errors') }]),
      section('Lint', [{ current: finding(Status.Failed, 'x', textDetails('Output', 'error')) }]),
    ]

    expect(passedDetails(results, LIMIT)).toEqual([
      '',
      '<details><summary>2 passed</summary>',
      '',
      '**Mutation** · Mutated files',
      '',
      '| f |',
      '',
      '</details>',
    ])
  })

  it('should leave the block out when no passing check has details, or details are dropped', () => {
    const results = [
      section('Mutation', [
        { current: finding(Status.Ok, 'score 100%', markdownDetails('Mutated files', '| f |')) },
      ]),
    ]

    expect(
      passedDetails([section('Types', [{ current: finding(Status.Ok, 'ok') }])], LIMIT),
    ).toEqual([])
    expect(passedDetails(results, 0)).toEqual([])
  })
})
