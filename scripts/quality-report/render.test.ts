import { describe, expect, it } from 'vitest'

import { Analysis } from './analysis.ts'
import type { CheckResult, SectionResult } from './evaluate.ts'
import { DetailsFormat, finding, type Finding, markdownDetails, textDetails } from './finding.ts'
import { MARKER, renderReport, type ReportContext } from './render.ts'
import { Group, Job, type Section } from './sections.ts'
import { Status, worst } from './status.ts'

const CONTEXT: ReportContext = { baseName: 'main', footer: 'commit `abc1234`' }

function section(
  title: string,
  findings: readonly Finding[],
  group: Group = Group.Code,
): SectionResult {
  const results = findings.map((item, index): CheckResult => ({
    check: {
      analysis: Analysis.Eslint,
      job: Job.Lint,
      label: `check ${String(index)}`,
      analyze: () => item,
    },
    finding: item,
    base: undefined,
    seconds: 0,
  }))
  const definition: Section = {
    group,
    title,
    reproduce: 'make lint',
    checks: results.map(({ check }) => check),
  }
  return { section: definition, status: worst(findings.map(({ status }) => status)), results }
}

const ALL_GOOD = [
  section('Lint and format', [finding(Status.Ok, 'No lint problems')]),
  section('Types (tsc)', [finding(Status.Ok, 'No type errors')]),
]

describe('renderReport', () => {
  it('should start with the marker that lets CI update the same comment', () => {
    expect(
      renderReport(ALL_GOOD, CONTEXT).startsWith(`${MARKER}\n## 🔍 Quality Report\n\n> [!TIP]\n`),
    ).toBe(true)
  })

  it('should put the verdict, the problems, the table and the passing details in that order', () => {
    const results = [
      section('Mutation testing', [
        finding(Status.Ok, 'score 100%', markdownDetails('Mutated files', '| a | b |')),
      ]),
      section('Types (tsc)', [finding(Status.Failed, '1 type error')]),
    ]

    const report = renderReport(results, CONTEXT)

    const order = [
      '> [!CAUTION]',
      '### ❌ Types (tsc)',
      '| Area | Check |',
      '<summary>1 passed</summary>',
    ]
    const positions = order.map((text) => report.indexOf(text))
    expect(positions.every((position) => position > 0)).toBe(true)
    expect(positions).toEqual(positions.toSorted((left, right) => left - right))
  })

  it('should end with the disclaimer and the footer in small print', () => {
    expect(renderReport(ALL_GOOD, CONTEXT)).toMatch(
      /\n---\n<sub>This report only informs: each CI job is still the gate for its own checks\. · commit `abc1234`<\/sub>\n$/,
    )
    expect(renderReport(ALL_GOOD, { baseName: 'main', footer: '' })).toMatch(
      /own checks\.<\/sub>\n$/,
    )
  })

  it('should keep only the end of long details', () => {
    const output = `${'start '.repeat(10)}${'x'.repeat(7000)}`
    const failed = section('Lint', [finding(Status.Failed, 'x', textDetails('Output', output))])

    const report = renderReport([failed], CONTEXT)

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

    const report = renderReport(results, CONTEXT)

    expect(report.length).toBeLessThanOrEqual(60_000)
    expect(report).toContain('_Details were trimmed to fit in a comment._')
    expect(report).toContain('```text\n[...truncated...]')
  })

  it('should drop the details when trimming is not enough', () => {
    const results = Array.from(Array(700).keys(), (index) =>
      section(`Section ${String(index)}`, [
        finding(Status.Failed, 'x', textDetails('Output', 'z'.repeat(100))),
      ]),
    )

    const report = renderReport(results, CONTEXT)

    expect(report).not.toContain('zzz')
    expect(report).toContain('_Details were trimmed to fit in a comment._')
  })
})
