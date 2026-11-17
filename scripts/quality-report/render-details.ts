import { tail } from '../shared/text.ts'
import { checkDetail, type CheckResult, isInherited, type SectionResult } from './evaluate.ts'
import { type Details, DetailsFormat } from './finding.ts'
import { Status } from './status.ts'

// Failures first, then warnings: what to fix, open.
const ATTENTION: readonly Status[] = [Status.Failed, Status.Warning]
export const NO_DETAILS = 0
const MIN_REPORTED_SECONDS = 0.1

interface ProblemOptions {
  readonly isSingle: boolean
  readonly baseName: string
  readonly limit: number
}

export function problems(
  results: readonly SectionResult[],
  baseName: string,
  limit: number,
): string[] {
  return ATTENTION.flatMap((status) =>
    results
      .filter((result) => result.status === status)
      .flatMap((result) =>
        problem(result, { isSingle: result.results.length === 1, baseName, limit }),
      ),
  )
}

function problem(result: SectionResult, options: ProblemOptions): string[] {
  const checks = result.results
    .filter((item) => ATTENTION.includes(item.finding.status))
    .flatMap((item) => attentionCheck(item, options))
  return [
    '',
    `### ${result.status} ${result.section.title}`,
    ...checks,
    '',
    `**Reproduce**: \`${result.section.reproduce}\``,
  ]
}

function attentionCheck(item: CheckResult, options: ProblemOptions): string[] {
  const label = options.isSingle ? '' : `**${item.check.label}**: `
  const inherited = isInherited(item) ? ` · inherited from \`${options.baseName}\`` : ''
  return [
    '',
    `${label}${checkDetail(item)}${inherited}${duration(item.seconds)}`,
    ...detailsBlock(item.finding.details, options.limit),
  ]
}

function duration(seconds: number): string {
  return seconds >= MIN_REPORTED_SECONDS ? ` _(${seconds.toFixed(1)}s)_` : ''
}

// The details of the passing checks, folded in one block at the end: they need no attention.
export function passedDetails(results: readonly SectionResult[], limit: number): string[] {
  const passed = results.filter((result) => result.status === Status.Ok)
  const blocks = passed.flatMap((result) =>
    result.results.flatMap((item) => passedBlock(result.section.title, item, limit)),
  )
  if (blocks.length === 0) {
    return []
  }
  const summary = `${String(passed.length)} passed`
  return ['', `<details><summary>${summary}</summary>`, ...blocks, '', '</details>']
}

function passedBlock(title: string, item: CheckResult, limit: number): string[] {
  const { details } = item.finding
  if (details === undefined || limit <= NO_DETAILS) {
    return []
  }
  return ['', `**${title}** · ${details.title}`, '', body(details, limit)]
}

function detailsBlock(details: Details | undefined, limit: number): string[] {
  if (details === undefined || limit <= NO_DETAILS) {
    return []
  }
  return ['', body(details, limit)]
}

function body(details: Details, limit: number): string {
  const isInline = details.format === DetailsFormat.Markdown && details.body.length <= limit
  return isInline ? details.body : fence(tail(details.body, limit))
}

function fence(text: string): string {
  return `\`\`\`text\n${text.replaceAll('```', "'''")}\n\`\`\``
}
