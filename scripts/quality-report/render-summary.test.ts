import { describe, expect, it } from 'vitest'

import { Analysis } from './analysis.ts'
import type { CheckResult, SectionResult } from './evaluate.ts'
import { finding, type Finding } from './finding.ts'
import { table, verdict } from './render-summary.ts'
import { Group, Job } from './sections.ts'
import { Status, worst } from './status.ts'

interface Check {
  readonly current: Finding
  readonly base?: Finding
}

function section(
  title: string,
  checks: readonly Check[],
  group: Group = Group.Code,
): SectionResult {
  const results = checks.map(({ current, base }, index): CheckResult => ({
    check: {
      analysis: Analysis.Eslint,
      job: Job.Lint,
      label: `check ${String(index)}`,
      analyze: () => current,
    },
    finding: current,
    base,
    seconds: 0,
  }))
  const checksOf = results.map(({ check }) => check)
  return {
    section: { group, title, reproduce: 'make lint', checks: checksOf },
    status: worst(checks.map(({ current }) => current.status)),
    results,
  }
}

function withStatus(status: Status, base?: Status): SectionResult {
  return section(status, [
    base === undefined
      ? { current: finding(status, 'x') }
      : { current: finding(status, 'x'), base: finding(base, 'y') },
  ])
}

describe('verdict', () => {
  it.each([
    [[Status.Ok, Status.Ok], 'TIP', '✅ 2 passed'],
    [[Status.Ok, Status.Skipped], 'TIP', '✅ 1 passed · ⏭️ 1 skipped'],
    [[Status.Warning, Status.Ok], 'WARNING', '⚠️ 1 warning · ✅ 1 passed'],
    [[Status.Warning, Status.Warning], 'WARNING', '⚠️ 2 warnings · ✅ 0 passed'],
    [
      [Status.Failed, Status.Warning, Status.Ok],
      'CAUTION',
      '❌ 1 failed · ⚠️ 1 warning · ✅ 1 passed',
    ],
  ])('should summarise %j in a %s alert', (statuses, alert, line) => {
    expect(
      verdict(
        statuses.map((status) => withStatus(status)),
        'main',
      ),
    ).toEqual([`> [!${alert}]`, `> ${line}`])
  })

  it('should say when the base branch already had every failure', () => {
    expect(verdict([withStatus(Status.Failed, Status.Failed)], 'main')[1]).toBe(
      '> ❌ 1 failed, inherited from `main` · ✅ 0 passed',
    )
    expect(
      verdict(
        [withStatus(Status.Failed, Status.Failed), withStatus(Status.Failed, Status.Failed)],
        'main',
      )[1],
    ).toBe('> ❌ 2 failed, all inherited from `main` · ✅ 0 passed')
  })

  it('should count the inherited failures when only some are', () => {
    const results = [withStatus(Status.Failed, Status.Failed), withStatus(Status.Failed, Status.Ok)]

    expect(verdict(results, 'develop')[1]).toBe(
      '> ❌ 2 failed (1 inherited from `develop`) · ✅ 0 passed',
    )
  })
})

describe('table', () => {
  it('should group the sections by area, naming the area on its first row', () => {
    const results = [
      section('Types (tsc)', [{ current: finding(Status.Ok, 'No type errors') }]),
      section('Architecture', [{ current: finding(Status.Ok, 'kept') }], Group.Architecture),
      section('Dead code (knip)', [{ current: finding(Status.Failed, '2 unused | exports') }]),
    ]

    expect(table(results, 'main')).toEqual([
      '',
      '| Area | Check | Status | Detail |',
      '| --- | --- | :---: | --- |',
      '| **Code** | Types (tsc) | ✅ | No type errors |',
      '|  | Dead code (knip) | ❌ | 2 unused \\| exports |',
      '| **Architecture** | Architecture | ✅ | kept |',
    ])
  })

  it('should join the different details of a section and compare the metrics', () => {
    const coverage = { label: 'coverage', value: 100, unit: '%', decimals: 2 }
    const results = [
      section('Tests', [
        {
          current: { ...finding(Status.Ok, '10 passed'), metric: coverage },
          base: { ...finding(Status.Ok, ''), metric: { ...coverage, value: 99.5 } },
        },
        { current: finding(Status.Ok, 'same\nline') },
        { current: finding(Status.Ok, 'same\nline') },
      ]),
    ]

    expect(table(results, 'main')[3]).toBe(
      '| **Code** | Tests | ✅ | 10 passed · coverage 100.00% (↑0.50) · same line |',
    )
  })

  it('should mark a failure the base branch already had', () => {
    expect(table([withStatus(Status.Failed, Status.Failed)], 'main')[3]).toBe(
      '| **Code** | ❌ | ❌ | x · inherited from `main` |',
    )
  })
})
