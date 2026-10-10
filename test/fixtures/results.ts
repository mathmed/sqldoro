// Result tabs and columns for the tests of the protocol, the extension host and the webview.
import { NOT_EDITING } from '../../src/core/edits/tab-editor.ts'
import { ColumnKind, type ResultColumn } from '../../src/core/engine/query.ts'
import { ValueType } from '../../src/core/engine/table.ts'
import {
  EditingState,
  type ResultTab,
  type TabEditing,
  TabKind,
  TabStatus,
} from '../../src/core/results/protocol.ts'
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
    summary: { durationMs: 12.5, affectedRows: null, isTruncated: false, autoLimit: null },
    error: null,
    notice: '',
    plan: [],
    editing: NOT_EDITING,
    ...changes,
  }
}

// A tab whose rows can be edited: id (a whole number) and name (text of at most 10 characters).
export function editableTab(
  editing: Partial<TabEditing> = {},
  changes: Partial<ResultTab> = {},
): ResultTab {
  return resultTab({
    rowCount: 4,
    loadedRows: 4,
    editing: {
      ...NOT_EDITING,
      state: EditingState.Editable,
      table: 'sales.orders',
      key: ['id'],
      columns: [
        { type: ValueType.Integer, min: '-2147483648', max: '2147483647' },
        { type: ValueType.Text, maxLength: 10 },
      ],
      ...editing,
    },
    ...changes,
  })
}
