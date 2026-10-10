import { groupDigits } from '../results/tabs.ts'
import { compactCount, formatSize } from '../text/quantities.ts'
import type { DatabaseStats, TableStats } from './catalog.ts'

const SEPARATOR = ' · '
const ESTIMATE = '~'
const ESTIMATES_NOTE = 'Estimates from the catalog statistics'
const SINGLE = 1n

// "~27k rows · 32 MB" beside a table; empty without statistics.
export function tableStatsSummary(stats: TableStats | undefined): string {
  if (stats === undefined) {
    return ''
  }
  const { estimatedRows: rows, sizeBytes: size } = stats
  return [
    ...(rows === undefined ? [] : [`${ESTIMATE}${compactCount(rows)} ${word(rows, 'row')}`]),
    ...(size === undefined ? [] : [formatSize(size)]),
  ].join(SEPARATOR)
}

// The lines a table's tooltip adds: the exact numbers, and where they come from.
export function tableStatsDetails(stats: TableStats | undefined): readonly string[] {
  if (stats === undefined) {
    return []
  }
  const { estimatedRows: rows, sizeBytes: size } = stats
  const lines = [
    ...(rows === undefined ? [] : [`Rows: ${ESTIMATE}${groupDigits(rows)}`]),
    ...(size === undefined ? [] : [sizeDetail(size)]),
  ]
  return lines.length === 0 ? [] : [...lines, ESTIMATES_NOTE]
}

// "2 GB" beside a database; empty when its size is unknown.
export function databaseStatsSummary(stats: DatabaseStats | undefined): string {
  return stats?.sizeBytes === undefined ? '' : formatSize(stats.sizeBytes)
}

export function databaseStatsDetails(stats: DatabaseStats | undefined): readonly string[] {
  return stats?.sizeBytes === undefined ? [] : [sizeDetail(stats.sizeBytes)]
}

// How many objects a group lists: "142", or "3 of 142" when the filter hides the others.
export function objectCount(shown: number, total: number): string {
  return shown === total ? groupDigits(total) : `${groupDigits(shown)} of ${groupDigits(total)}`
}

function sizeDetail(bytes: bigint): string {
  return `Size: ${formatSize(bytes)} (${groupDigits(bytes)} ${word(bytes, 'byte')})`
}

function word(count: bigint, singular: string): string {
  return count === SINGLE ? singular : `${singular}s`
}
