import { type ResultTab, TabKind, TabStatus, type TabSummary } from './protocol.ts'

const WHITESPACE = /\s+/g
const TITLE_LENGTH = 60
const ELLIPSIS = '…'
const GROUP_SIZE = 3
const MILLISECONDS_PER_SECOND = 1000
const SECOND_DECIMALS = 2

// The title of a result tab: the statement on one line, cut to fit.
export function tabTitle(sql: string): string {
  const line = sql.replaceAll(WHITESPACE, ' ').trim()
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1)}${ELLIPSIS}` : line
}

// 1234567 is 1,234,567 whatever the locale of the machine.
export function groupDigits(count: bigint | number): string {
  const digits = String(count)
  const groups: string[] = []
  for (let end = digits.length; end > 0; end -= GROUP_SIZE) {
    groups.unshift(digits.slice(Math.max(0, end - GROUP_SIZE), end))
  }
  return groups.join(',')
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${groupDigits(count)} ${count === 1 ? singular : pluralForm}`
}

export function formatDuration(milliseconds: number): string {
  return milliseconds < MILLISECONDS_PER_SECOND
    ? `${String(Math.round(milliseconds))} ms`
    : `${(milliseconds / MILLISECONDS_PER_SECOND).toFixed(SECOND_DECIMALS)} s`
}

// What the status line of a finished tab says: rows returned or changed, and the time it took.
export function summaryText(summary: TabSummary, rowCount: number): string {
  const rows =
    summary.affectedRows === null
      ? plural(rowCount, 'row', 'rows')
      : plural(summary.affectedRows, 'row affected', 'rows affected')
  return `${rows}${limitText(summary)} in ${formatDuration(summary.durationMs)}`
}

function limitText(summary: TabSummary): string {
  if (!summary.isTruncated) {
    return ''
  }
  return summary.autoLimit === null
    ? ' (row limit reached)'
    : ` (limited to ${plural(summary.autoLimit, 'row', 'rows')})`
}

// A query cut by the automatic limit can run again without it.
export function canLoadAll(tab: Pick<ResultTab, 'kind' | 'status' | 'summary'>): boolean {
  return (
    tab.kind === TabKind.Rows &&
    tab.status === TabStatus.Succeeded &&
    tab.summary?.isTruncated === true &&
    tab.summary.autoLimit !== null
  )
}
