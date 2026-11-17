import type { SectionResult } from './evaluate.ts'
import { NO_DETAILS, passedDetails, problems } from './render-details.ts'
import { table, verdict } from './render-summary.ts'

export const MARKER = '<!-- quality-report -->'
const MAX_DETAILS_CHARS = 6000
// GitHub rejects comments above 65536 characters: the report is rendered again with less detail.
const MAX_REPORT_CHARS = 60_000
const TRIMMED_DETAILS_CHARS = 1500
const DISCLAIMER = 'This report only informs: each CI job is still the gate for its own checks.'

export interface ReportContext {
  // The base branch the failures and the metrics are compared with.
  readonly baseName: string
  // The commit, the time, the run and the baseline, already written out.
  readonly footer: string
}

// Top to bottom: the verdict, what to fix (failures, then warnings, open), the table of every
// check by area, the details of the passing checks folded, and the footer.
export function renderReport(results: readonly SectionResult[], context: ReportContext): string {
  let report = renderWithLimit(results, context, MAX_DETAILS_CHARS)
  for (const limit of [TRIMMED_DETAILS_CHARS, NO_DETAILS]) {
    if (report.length <= MAX_REPORT_CHARS) {
      break
    }
    report = renderWithLimit(results, context, limit)
  }
  return report
}

function renderWithLimit(
  results: readonly SectionResult[],
  context: ReportContext,
  limit: number,
): string {
  const notes = [DISCLAIMER, context.footer].filter((note) => note !== '').join(' · ')
  const lines = [
    MARKER,
    '## 🔍 Quality Report',
    '',
    ...verdict(results, context.baseName),
    ...problems(results, context.baseName, limit),
    ...table(results, context.baseName),
    ...passedDetails(results, limit),
    ...(limit < MAX_DETAILS_CHARS ? ['', '_Details were trimmed to fit in a comment._'] : []),
    '',
    '---',
    `<sub>${notes}</sub>`,
  ]
  return `${lines.join('\n')}\n`
}
