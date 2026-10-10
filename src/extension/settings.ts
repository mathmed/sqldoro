import * as vscode from 'vscode'

// The only module that reads the settings of the extension (contributes.configuration).
const SECTION = 'sqldoro'

const SettingKey = {
  MaxRows: 'results.maxRows',
  HistorySize: 'history.maxEntriesPerConnection',
} as const

export interface Settings {
  // Rows kept of a result; the rest are not fetched.
  readonly maxRows: number
  readonly historySize: number
}

interface Range {
  readonly fallback: number
  readonly min: number
  readonly max: number
}

const MAX_ROWS: Range = { fallback: 100_000, min: 1, max: 5_000_000 }
const HISTORY_SIZE: Range = { fallback: 500, min: 1, max: 10_000 }

export function readSettings(): Settings {
  const configuration = vscode.workspace.getConfiguration(SECTION)
  return {
    maxRows: wholeNumber(configuration.get(SettingKey.MaxRows), MAX_ROWS),
    historySize: wholeNumber(configuration.get(SettingKey.HistorySize), HISTORY_SIZE),
  }
}

// A value that is not a number takes the default; any other is kept inside its range.
function wholeNumber(value: unknown, range: Range): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return range.fallback
  }
  return Math.min(Math.max(Math.trunc(value), range.min), range.max)
}
