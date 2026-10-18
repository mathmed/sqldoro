import {
  parseSuppressionsLine,
  type SuppressionChange,
  type SuppressionsResult,
} from '../../shared/suppressions-result.ts'
import { cleanOutput, plural } from '../../shared/text.ts'
import { finding, type Finding, markdownDetails, textDetails } from '../finding.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'

const MAX_CHANGES_LISTED = 50

export function analyzeSuppressions(fragment: Fragment): Finding {
  const output = cleanOutput(fragment.output)
  const result = parseSuppressionsLine(output)
  if (result === undefined) {
    const summary = 'the suppression check failed before producing a result'
    return finding(Status.Failed, summary, textDetails('Output', output))
  }
  if (result.changes.length === 0) {
    return finding(Status.Ok, `${totals(result)} · matches the baseline`)
  }
  return finding(Status.Failed, failedSummary(result), markdownDetails('Changes', table(result)))
}

function totals(result: SuppressionsResult): string {
  const kinds = result.totals.map(({ kind, count }) => `${kind} ${String(count)}`)
  const total = plural(result.total, 'suppression', 'suppressions')
  return kinds.length === 0 ? total : `${total} (${kinds.join(', ')})`
}

function failedSummary(result: SuppressionsResult): string {
  const added = sumOf(result.changes, (change) => Math.max(change.current - change.baseline, 0))
  const removed = sumOf(result.changes, (change) => Math.max(change.baseline - change.current, 0))
  if (added > 0) {
    return `${plural(added, 'new suppression', 'new suppressions')} above the baseline · ${totals(result)}`
  }
  const lowered = plural(removed, 'suppression', 'suppressions')
  return `${lowered} removed: lower the baseline with \`make suppressions-update\` · ${totals(result)}`
}

function sumOf(
  changes: readonly SuppressionChange[],
  amount: (change: SuppressionChange) => number,
): number {
  return changes.reduce((sum, change) => sum + amount(change), 0)
}

function table(result: SuppressionsResult): string {
  const listed = result.changes.slice(0, MAX_CHANGES_LISTED)
  const hidden = result.changes.length - listed.length
  return [
    '| File | Kind | Baseline → current | Lines |',
    '| --- | --- | ---: | --- |',
    ...listed.map(row),
    ...(hidden > 0 ? ['', `... and ${String(hidden)} more: run \`make suppressions\`.`] : []),
  ].join('\n')
}

function row({ path, kind, baseline, current, lines }: SuppressionChange): string {
  const where = lines.length === 0 ? '-' : lines.join(', ')
  return `| \`${path}\` | ${kind} | ${String(baseline)} → ${String(current)} | ${where} |`
}
