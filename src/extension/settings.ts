import * as vscode from 'vscode'

import { type GuardPolicy, productionEnvironments } from '../core/safety/guard.ts'
import { isTransactionMode, TransactionMode } from '../core/safety/transaction.ts'

// The only module that reads the settings of the extension (contributes.configuration).
const SECTION = 'sqldoro'

const SettingKey = {
  MaxRows: 'results.maxRows',
  HistorySize: 'history.maxEntriesPerConnection',
  AutoLimitEnabled: 'autoLimit.enabled',
  AutoLimitRows: 'autoLimit.rows',
  ProductionEnvironments: 'safety.productionEnvironments',
  TransactionMode: 'transactions.defaultMode',
} as const

export interface Settings {
  // Rows kept of a result; the rest are not fetched.
  readonly maxRows: number
  readonly historySize: number
  // The rows a query without a limit of its own gets; null when automatic limits are off.
  readonly autoLimit: number | null
  readonly policy: GuardPolicy
  // The mode a SQL editor starts in.
  readonly transactionMode: TransactionMode
}

interface Range {
  readonly fallback: number
  readonly min: number
  readonly max: number
}

const MAX_ROWS: Range = { fallback: 100_000, min: 1, max: 5_000_000 }
const HISTORY_SIZE: Range = { fallback: 500, min: 1, max: 10_000 }
const AUTO_LIMIT: Range = { fallback: 1000, min: 1, max: 5_000_000 }

export function readSettings(): Settings {
  const configuration = vscode.workspace.getConfiguration(SECTION)
  return {
    maxRows: wholeNumber(configuration.get(SettingKey.MaxRows), MAX_ROWS),
    historySize: wholeNumber(configuration.get(SettingKey.HistorySize), HISTORY_SIZE),
    autoLimit: autoLimitOf(configuration),
    policy: {
      productionEnvironments: productionEnvironments(
        listOf(configuration.get(SettingKey.ProductionEnvironments)),
      ),
    },
    transactionMode: modeOf(configuration.get(SettingKey.TransactionMode)),
  }
}

// Only an explicit false turns automatic limits off.
function autoLimitOf(configuration: vscode.WorkspaceConfiguration): number | null {
  return configuration.get(SettingKey.AutoLimitEnabled) === false
    ? null
    : wholeNumber(configuration.get(SettingKey.AutoLimitRows), AUTO_LIMIT)
}

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function modeOf(value: unknown): TransactionMode {
  return isTransactionMode(value) ? value : TransactionMode.Auto
}

// A value that is not a number takes the default; any other is kept inside its range.
function wholeNumber(value: unknown, range: Range): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return range.fallback
  }
  return Math.min(Math.max(Math.trunc(value), range.min), range.max)
}
