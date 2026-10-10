import { plural, tail } from '../shared/text.ts'
import type { CheckResult, SectionResult } from './evaluate.ts'
import { type Details, DetailsFormat } from './finding.ts'
import { Status } from './status.ts'

export const MARKER = '<!-- quality-report -->'
const MAX_DETAILS_CHARS = 6000
// GitHub rejects comments above 65536 characters: the report is rendered again with less detail.
const MAX_REPORT_CHARS = 60_000
const TRIMMED_DETAILS_CHARS = 1500
const NO_DETAILS = 0
const MIN_REPORTED_SECONDS = 0.1
const DISCLAIMER = 'This report only informs: each CI job is still the gate for its own checks.'

export function renderReport(results: readonly SectionResult[], footer: string): string {
  let report = renderWithLimit(results, footer, MAX_DETAILS_CHARS)
  for (const limit of [TRIMMED_DETAILS_CHARS, NO_DETAILS]) {
    if (report.length <= MAX_REPORT_CHARS) {
      break
    }
    report = renderWithLimit(results, footer, limit)
  }
  return report
}

function renderWithLimit(results: readonly SectionResult[], footer: string, limit: number): string {
  const lines = [
    MARKER,
    '## 🔍 Quality Report',
    '',
    verdict(results),
    '',
    '| Analysis | Status | Result |',
    '| --- | --- | --- |',
    ...results.map(summaryRow),
    ...results.flatMap((result) => renderSection(result, limit)),
    ...(limit < MAX_DETAILS_CHARS ? ['', '_Details were trimmed to fit in a comment._'] : []),
    '',
    '---',
    DISCLAIMER,
    ...(footer === '' ? [] : [footer]),
  ]
  return `${lines.join('\n')}\n`
}

function verdict(results: readonly SectionResult[]): string {
  const failed = countWithStatus(results, Status.Failed)
  if (failed > 0) {
    return `❌ **Failed**: ${plural(failed, 'section failed', 'sections failed')}`
  }
  const warnings = countWithStatus(results, Status.Warning)
  if (warnings > 0) {
    return `⚠️ **Passed with warnings**: ${plural(warnings, 'section', 'sections')} with warnings`
  }
  const skipped = countWithStatus(results, Status.Skipped)
  const notRun = skipped > 0 ? ` (${plural(skipped, 'section', 'sections')} not run)` : ''
  return `✅ **All good**${notRun}`
}

function countWithStatus(results: readonly SectionResult[], status: Status): number {
  return results.filter((result) => result.status === status).length
}

function summaryRow(result: SectionResult): string {
  return `| ${result.section.title} | ${result.status} | ${oneLine(result)} |`
}

function oneLine({ results }: SectionResult): string {
  const [only] = results
  if (results.length === 1 && only !== undefined) {
    return only.finding.summary.replaceAll('|', '\\|')
  }
  return results.map(({ check, finding }) => `${check.label}: ${finding.status}`).join(' · ')
}

function renderSection(result: SectionResult, limit: number): string[] {
  const isMultiple = result.results.length > 1
  const checks = result.results.flatMap((item) => renderCheck(item, isMultiple, limit))
  return ['', `### ${result.status} ${result.section.title}`, '', ...checks]
}

function renderCheck(
  { check, finding, seconds }: CheckResult,
  isMultiple: boolean,
  limit: number,
): string[] {
  const label = isMultiple ? `- ${finding.status} **${check.label}**: ` : ''
  return [
    `${label}${finding.summary}${duration(seconds)}`,
    ...renderDetails(finding.details, limit),
  ]
}

function duration(seconds: number): string {
  return seconds >= MIN_REPORTED_SECONDS ? ` _(${seconds.toFixed(1)}s)_` : ''
}

function renderDetails(details: Details | undefined, limit: number): string[] {
  if (details === undefined || limit <= NO_DETAILS) {
    return []
  }
  const isInline = details.format === DetailsFormat.Markdown && details.body.length <= limit
  return [
    '',
    `<details><summary>${details.title}</summary>`,
    '',
    isInline ? details.body : fence(tail(details.body, limit)),
    '',
    '</details>',
  ]
}

function fence(text: string): string {
  return `\`\`\`text\n${text.replaceAll('```', "'''")}\n\`\`\``
}
