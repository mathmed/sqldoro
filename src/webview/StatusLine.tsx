import type { ReactElement } from 'react'

import { type ResultTab, TabStatus } from '../core/results/protocol.ts'
import { formatDuration, groupDigits, plural, summaryText } from '../core/results/tabs.ts'

// What happened to the statement, read out by screen readers as it changes; its tooltip shows the
// statement.
export const StatusLine = ({ tab }: { readonly tab: ResultTab }): ReactElement => (
  <div
    className={`status-line status-line-${tab.status}`}
    role="status"
    aria-live="polite"
    title={tab.sql}
  >
    {[statusText(tab), viewText(tab), tab.notice].filter((part) => part !== '').join(' · ')}
  </div>
)

function statusText(tab: ResultTab): string {
  if (tab.status === TabStatus.Running) {
    return `Running… ${plural(tab.loadedRows, 'row', 'rows')} so far`
  }
  if (tab.error !== null) {
    return `${tab.error.message}${placeText(tab.error.line, tab.error.column)}`
  }
  if (tab.summary === null) {
    return ''
  }
  return tab.status === TabStatus.Cancelled
    ? `Cancelled after ${formatDuration(tab.summary.durationMs)}`
    : summaryText(tab.summary, tab.loadedRows)
}

function placeText(line: number | null, column: number | null): string {
  return line === null ? '' : ` (line ${String(line)}, column ${String(column ?? 1)})`
}

// A filtered view says how many rows it shows; a view sorted or filtered by the server says so.
function viewText(tab: ResultTab): string {
  if (tab.isServerView) {
    return 'sorted and filtered by the server'
  }
  return tab.rowCount === tab.loadedRows
    ? ''
    : `showing ${groupDigits(tab.rowCount)} of ${groupDigits(tab.loadedRows)}`
}
