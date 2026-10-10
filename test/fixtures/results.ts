// Result tabs and columns for the tests of the protocol, the extension host and the webview.
import { ColumnKind, type ResultColumn } from '../../src/core/engine/query.ts'
import { type ResultTab, TabKind, TabStatus } from '../../src/core/results/protocol.ts'
import { IDENTITY_VIEW } from '../../src/core/results/view.ts'

export const RESULT_COLUMNS: readonly ResultColumn[] = [
  { name: 'id', dataType: 'INT8', kind: ColumnKind.Number },
  { name: 'name', dataType: 'TEXT', kind: ColumnKind.Text },
]

export function resultTab(changes: Partial<ResultTab> = {}): ResultTab {
  return {
    id: 'tab-1',
    title: 'SELECT * FROM orders',
    sql: 'SELECT * FROM orders',
    kind: TabKind.Rows,
    status: TabStatus.Succeeded,
    columns: RESULT_COLUMNS,
    rowCount: 2,
    loadedRows: 2,
    view: IDENTITY_VIEW,
    viewVersion: 0,
    isServerView: false,
    canServerView: true,
    summary: { durationMs: 12.5, affectedRows: null, isTruncated: false },
    error: null,
    notice: '',
    plan: [],
    ...changes,
  }
}
