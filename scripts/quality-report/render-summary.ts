import { plural } from '../shared/text.ts'
import { checkDetail, isSectionInherited, type SectionResult } from './evaluate.ts'
import { Group } from './sections.ts'
import { Status } from './status.ts'

// GitHub alerts: red when something failed, yellow for warnings only, green otherwise.
const ALERTS: ReadonlyMap<Status, string> = new Map([
  [Status.Failed, 'CAUTION'],
  [Status.Warning, 'WARNING'],
])
const DEFAULT_ALERT = 'TIP'
const SEPARATOR = ' · '

// "> ❌ 2 failed (1 inherited from `main`) · ⚠️ 1 warning · ✅ 12 passed · ⏭️ 1 skipped"
export function verdict(results: readonly SectionResult[], baseName: string): string[] {
  const parts = [
    failedText(results, baseName),
    countText(results, Status.Warning, (count) => plural(count, 'warning', 'warnings')),
    `${Status.Ok} ${String(countOf(results, Status.Ok))} passed`,
    countText(results, Status.Skipped, (count) => `${String(count)} skipped`),
  ]
  const alert = ALERTS.get(attentionStatus(results)) ?? DEFAULT_ALERT
  return [`> [!${alert}]`, `> ${parts.filter((part) => part !== '').join(SEPARATOR)}`]
}

function attentionStatus(results: readonly SectionResult[]): Status {
  return countOf(results, Status.Failed) > 0 ? Status.Failed : statusIfAny(results, Status.Warning)
}

function statusIfAny(results: readonly SectionResult[], status: Status): Status {
  return countOf(results, status) > 0 ? status : Status.Ok
}

function failedText(results: readonly SectionResult[], baseName: string): string {
  const failed = results.filter((result) => result.status === Status.Failed)
  if (failed.length === 0) {
    return ''
  }
  const text = `${Status.Failed} ${String(failed.length)} failed`
  return `${text}${inheritedText(failed, baseName)}`
}

// Whether the base branch already had the failures: none, some or all of them.
function inheritedText(failed: readonly SectionResult[], baseName: string): string {
  const inherited = failed.filter(isSectionInherited).length
  if (inherited === 0) {
    return ''
  }
  if (inherited < failed.length) {
    return ` (${String(inherited)} inherited from \`${baseName}\`)`
  }
  return `, ${failed.length > 1 ? 'all ' : ''}inherited from \`${baseName}\``
}

function countText(
  results: readonly SectionResult[],
  status: Status,
  text: (count: number) => string,
): string {
  const count = countOf(results, status)
  return count === 0 ? '' : `${status} ${text(count)}`
}

function countOf(results: readonly SectionResult[], status: Status): number {
  return results.filter((result) => result.status === status).length
}

// One row per section, grouped by area: the area is named on the first row of its group.
export function table(results: readonly SectionResult[], baseName: string): string[] {
  const rows = Object.values(Group).flatMap((group) =>
    results
      .filter((result) => result.section.group === group)
      .map((result, index) => row(result, index === 0 ? `**${group}**` : '', baseName)),
  )
  return ['', '| Area | Check | Status | Detail |', '| --- | --- | :---: | --- |', ...rows]
}

function row(result: SectionResult, area: string, baseName: string): string {
  return `| ${area} | ${result.section.title} | ${result.status} | ${cell(sectionDetail(result, baseName))} |`
}

function sectionDetail(result: SectionResult, baseName: string): string {
  const details = [...new Set(result.results.map(checkDetail))].join(SEPARATOR)
  return isSectionInherited(result)
    ? `${details}${SEPARATOR}inherited from \`${baseName}\``
    : details
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ')
}
