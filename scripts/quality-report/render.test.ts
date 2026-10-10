import { describe, expect, it } from 'vitest'

import { Analysis } from './analysis.ts'
import type { CheckResult, SectionResult } from './evaluate.ts'
import { DetailsFormat, finding, type Finding, markdownDetails, textDetails } from './finding.ts'
import { MARKER, renderReport } from './render.ts'
import { Job, type Section } from './sections.ts'
import { Status, worst } from './status.ts'

function section(title: string, findings: readonly Finding[], seconds = 0): SectionResult {
  const checks = findings.map((item, index): CheckResult => ({
    check: {
      analysis: Analysis.Eslint,
      job: Job.Lint,
      label: `check ${String(index)}`,
      analyze: () => item,
    },
    finding: item,
    seconds,
  }))
  const definition: Section = { title, checks: checks.map(({ check }) => check) }
  return {
    section: definition,
    status: worst(findings.map(({ status }) => status)),
    results: checks,
  }
}

const ALL_GOOD = [
  section('Lint and format (ESLint, Prettier)', [finding(Status.Ok, 'No lint problems')], 2.04),
  section('Types (tsc)', [finding(Status.Ok, 'No type errors | none')], 0.05),
]

describe('renderReport', () => {
  it('should start with the marker that lets CI update the same comment', () => {
    expect(renderReport(ALL_GOOD, '').startsWith(`${MARKER}\n## 🔍 Quality Report\n`)).toBe(true)
  })

  it('should give the verdict and one table row per section', () => {
    const report = renderReport(ALL_GOOD, '')

    expect(report).toContain('✅ **All good**\n')
    expect(report).toContain('| Lint and format (ESLint, Prettier) | ✅ | No lint problems |')
    expect(report).toContain('| Types (tsc) | ✅ | No type errors \\| none |')
  })

  it('should render each section with its findings and how long it took', () => {
    const report = renderReport(ALL_GOOD, '')

    expect(report).toContain(
      '### ✅ Lint and format (ESLint, Prettier)\n\nNo lint problems _(2.0s)_\n',
    )
    expect(report).toContain('### ✅ Types (tsc)\n\nNo type errors | none\n')
  })

  it('should label each check of a section with several checks', () => {
    const security = section('Security (ESLint, npm audit)', [
      finding(Status.Ok, 'No security problems'),
      finding(Status.Failed, '2 moderate severity vulnerabilities'),
    ])

    const report = renderReport([security], '')

    expect(report).toContain('| Security (ESLint, npm audit) | ❌ | check 0: ✅ · check 1: ❌ |')
    expect(report).toContain('- ✅ **check 0**: No security problems\n- ❌ **check 1**: 2 moderate')
  })

  it.each([
    [[Status.Failed, Status.Warning], '❌ **Failed**: 1 section failed'],
    [[Status.Failed, Status.Failed], '❌ **Failed**: 2 sections failed'],
    [[Status.Warning, Status.Skipped], '⚠️ **Passed with warnings**: 1 section with warnings'],
    [[Status.Warning, Status.Warning], '⚠️ **Passed with warnings**: 2 sections with warnings'],
    [[Status.Skipped, Status.Ok], '✅ **All good** (1 section not run)'],
    [[Status.Skipped, Status.Skipped], '✅ **All good** (2 sections not run)'],
  ])('should summarise %j as "%s"', (statuses, expected) => {
    const results = statuses.map((status, index) =>
      section(`S${String(index)}`, [finding(status, 'x')]),
    )

    expect(renderReport(results, '')).toContain(`\n${expected}\n`)
  })

  it('should fold text details into a collapsible code block', () => {
    const failed = section('Types (tsc)', [
      finding(Status.Failed, '1 type error', textDetails('Type errors', 'a.ts(1,1): error TS1')),
    ])

    expect(renderReport([failed], '')).toContain(
      '<details><summary>Type errors</summary>\n\n```text\na.ts(1,1): error TS1\n```\n\n</details>',
    )
  })

  it('should not let tool output close the code block', () => {
    const failed = section('Lint', [
      finding(Status.Failed, 'x', textDetails('Output', '```\nevil')),
    ])

    expect(renderReport([failed], '')).toContain("```text\n'''\nevil\n```")
  })

  it('should embed Markdown details as they are', () => {
    const table = '| File | Score |\n| --- | --- |'
    const mutation = section('Mutation testing', [
      finding(Status.Ok, 'score 100%', markdownDetails('Mutated files', table)),
    ])

    expect(renderReport([mutation], '')).toContain(`<summary>Mutated files</summary>\n\n${table}\n`)
  })

  it('should end with the disclaimer and the footer', () => {
    expect(renderReport(ALL_GOOD, 'commit `abc1234`')).toMatch(
      /\n---\nThis report only informs: each CI job is still the gate for its own checks\.\ncommit `abc1234`\n$/,
    )
    expect(renderReport(ALL_GOOD, '').endsWith('gate for its own checks.\n')).toBe(true)
  })

  it('should keep only the end of long details', () => {
    const output = `${'start '.repeat(10)}${'x'.repeat(7000)}`
    const failed = section('Lint', [finding(Status.Failed, 'x', textDetails('Output', output))])

    const report = renderReport([failed], '')

    expect(report).toContain('[...truncated...]')
    expect(report).not.toContain('start')
    expect(report).not.toContain('_Details were trimmed')
  })

  it('should trim details further to fit in a GitHub comment', () => {
    const huge = (body: string): SectionResult =>
      section('Lint', [
        finding(Status.Failed, 'x', { title: 'Output', body, format: DetailsFormat.Markdown }),
      ])
    const results = Array.from({ length: 12 }, () => huge('y'.repeat(5000)))

    const report = renderReport(results, '')

    expect(report.length).toBeLessThanOrEqual(60_000)
    expect(report).toContain('_Details were trimmed to fit in a comment._')
    expect(report).toContain('```text\n[...truncated...]')
  })

  it('should drop the details when trimming is not enough', () => {
    const results = Array.from(Array(900).keys(), (index) =>
      section(`Section ${String(index)}`, [
        finding(Status.Failed, 'x', textDetails('Output', 'z'.repeat(100))),
      ]),
    )

    const report = renderReport(results, '')

    expect(report).not.toContain('<details>')
    expect(report).toContain('_Details were trimmed to fit in a comment._')
  })
})
