import * as vscode from 'vscode'

import { soleTable } from '../../core/completion/references.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import type { ResultColumn } from '../../core/engine/query.ts'
import {
  ExportFormat,
  formatRows,
  type FormatTarget,
  rowFormatter,
} from '../../core/results/export-format.ts'
import { projectRows } from '../../core/results/result-rows.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { plural } from '../../core/results/tabs.ts'
import { significantTokens } from '../../core/sql/statement-kind.ts'
import { type RowSource, writeExport } from './export-file.ts'
import type { CopyRequest } from './panel-actions.ts'

// Past this many rows, the clipboard is the wrong place: the result goes to a file.
const MAX_COPY_ROWS = 100_000
const STATUS_MESSAGE_MS = 4000
const FALLBACK_TABLE = 'table_name'
const FILE_SCHEME = 'file'

const FORMAT_NAMES: ReadonlyMap<ExportFormat, string> = new Map([
  [ExportFormat.Csv, 'CSV'],
  [ExportFormat.Tsv, 'TSV'],
  [ExportFormat.Json, 'JSON'],
  [ExportFormat.Sql, 'SQL INSERT statements'],
])

function target(tab: ResultSet, columns: FormatTarget['columns'], dialect: Dialect): FormatTarget {
  const table = soleTable(significantTokens(tab.sql, dialect.lexical)) ?? [FALLBACK_TABLE]
  return { columns, table, dialect }
}

export async function copyRows(
  tab: ResultSet,
  request: CopyRequest,
  dialect: Dialect,
): Promise<void> {
  const { block, format } = request
  const count = block.lastRow - block.firstRow + 1
  if (count > MAX_COPY_ROWS) {
    void vscode.window.showWarningMessage(
      `Copy at most ${plural(MAX_COPY_ROWS, 'row', 'rows')} at a time: export larger results to a file.`,
    )
    return
  }
  const { columns, rows } = tab.project(block)
  const text = formatRows(rows, rowFormatter(format, target(tab, columns, dialect)))
  await vscode.env.clipboard.writeText(text)
  vscode.window.setStatusBarMessage(
    `Copied ${plural(rows.length, 'row', 'rows')} as ${String(FORMAT_NAMES.get(format))}`,
    STATUS_MESSAGE_MS,
  )
}

// The name of a column of the result, as its header shows it.
export async function copyColumnName(tab: ResultSet, column: number): Promise<void> {
  const name = tab.columns.at(column)?.name
  if (name !== undefined) {
    await vscode.env.clipboard.writeText(name)
    vscode.window.setStatusBarMessage('Copied the name of the column', STATUS_MESSAGE_MS)
  }
}

async function askExportFile(format: ExportFormat): Promise<vscode.Uri | undefined> {
  const uri = await vscode.window.showSaveDialog({
    title: 'Export Result',
    saveLabel: 'Export',
    filters: { [String(FORMAT_NAMES.get(format))]: [format] },
  })
  if (uri?.scheme === FILE_SCHEME) {
    return uri
  }
  if (uri !== undefined) {
    void vscode.window.showErrorMessage('A result can only be exported to a file on this machine.')
  }
  return undefined
}

// The rows of the view as shown (filtered, sorted, in the columns the grid shows and their order),
// streamed to the file the user picks.
export async function exportRows(
  tab: ResultSet,
  format: ExportFormat,
  dialect: Dialect,
): Promise<void> {
  const uri = await askExportFile(format)
  if (uri === undefined) {
    return
  }
  const shown = shownRows(tab)
  const formatter = rowFormatter(format, target(tab, shown.columns, dialect))
  const outcome = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting the result',
      cancellable: true,
    },
    async (...[, token]) =>
      writeExport(uri.fsPath, shown, {
        formatter,
        isCancelled: () => token.isCancellationRequested,
      }),
  )
  if (!outcome.isCancelled) {
    void vscode.window.showInformationMessage(
      `Exported ${plural(outcome.rows, 'row', 'rows')} to ${uri.fsPath}`,
    )
  }
}

interface ShownRows extends RowSource {
  readonly columns: readonly ResultColumn[]
}

// The rows of the view in the columns the grid shows, in its order.
function shownRows(tab: ResultSet): ShownRows {
  const positions = tab.shownColumns
  return {
    columns: projectRows(tab.columns, { rows: [], positions }).columns,
    rowCount: tab.rowCount,
    rows: (start, count) =>
      projectRows(tab.columns, { rows: tab.rows(start, count), positions }).rows,
  }
}
