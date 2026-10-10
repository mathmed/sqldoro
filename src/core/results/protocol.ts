// The messages between the extension host and the result webview. Both sides validate what they
// receive (parse-host-message.ts, parse-webview-message.ts); values that may be absent are null,
// which survives the trip where undefined would not.
import type { EditKind } from '../edits/edit-kind.ts'
import type { PendingValue } from '../edits/pending.ts'
import type { CellValue, ResultColumn } from '../engine/query.ts'
import type { ValueSpec } from '../engine/table.ts'
import type { ExportFormat } from './export-format.ts'
import type { ViewSpec } from './view.ts'

export const TabStatus = {
  Running: 'running',
  Succeeded: 'succeeded',
  Failed: 'failed',
  Cancelled: 'cancelled',
} as const

export type TabStatus = (typeof TabStatus)[keyof typeof TabStatus]

// A tab shows the rows of a statement, or the plan EXPLAIN gave for it.
export const TabKind = {
  Rows: 'rows',
  Plan: 'plan',
} as const

export type TabKind = (typeof TabKind)[keyof typeof TabKind]

export interface TabSummary {
  readonly durationMs: number
  readonly affectedRows: number | null
  // More rows than the row limit: the rest were not kept.
  readonly isTruncated: boolean
  // The limit sqldoro gave a query that had none (the automatic LIMIT), or null.
  readonly autoLimit: number | null
}

// The connection of the editor, as the result view shows it above the tabs.
export interface PanelConnection {
  readonly name: string
  // The environment tag (prod, staging...), empty when the connection has none.
  readonly environment: string
  readonly isProduction: boolean
  readonly isReadOnly: boolean
}

// The server's message, and the place in the editor it points at (1-based) when it gave one.
export interface TabError {
  readonly message: string
  readonly line: number | null
  readonly column: number | null
}

// The editing of the rows of a tab. Rows are named by their position in the view; positions past
// the rows of the view name the rows added in the grid, in order.
export const EditingState = {
  // A running or failed statement, or a plan: nothing to edit.
  None: 'none',
  Checking: 'checking',
  ReadOnly: 'readOnly',
  Editable: 'editable',
  Applying: 'applying',
} as const

export type EditingState = (typeof EditingState)[keyof typeof EditingState]

export interface PendingCell {
  readonly column: number
  readonly value: PendingValue
}

// A changed row the view shows, by its position in the view.
export interface PendingRow {
  readonly row: number
  readonly isDeleted: boolean
  readonly cells: readonly PendingCell[]
  // Why the last apply did not take it, for people; empty otherwise.
  readonly problem: string
}

export interface NewRowView {
  readonly id: number
  readonly cells: readonly PendingCell[]
  readonly problem: string
}

export interface PreviewStatement {
  readonly sql: string
  // The bound values, in the order of their placeholders, as people read them.
  readonly values: readonly string[]
  readonly expectedRows: number
  readonly label: string
}

export interface EditPreview {
  // Applying names the preview it confirms: an older one applies nothing.
  readonly id: number
  readonly summary: string
  readonly statements: readonly PreviewStatement[]
  readonly deletions: number
  // Whether the statements join the open transaction of the editor instead of their own.
  readonly isInOpenTransaction: boolean
}

export interface TabEditing {
  readonly state: EditingState
  // Why the rows cannot be edited, when they cannot.
  readonly problem: string
  // The table and the columns of its key, when the rows can be edited.
  readonly table: string
  readonly key: readonly string[]
  // How each column of the result takes values; read-only ones say why.
  readonly columns: readonly ValueSpec[]
  // Why rows cannot be added; empty when they can.
  readonly insertProblem: string
  readonly rows: readonly PendingRow[]
  readonly newRows: readonly NewRowView[]
  // Changed rows the filters of the view hide.
  readonly hiddenRows: number
  readonly preview: EditPreview | null
  // What the last edit or apply said, for people; an error is shown as such.
  readonly notice: string
  readonly isNoticeError: boolean
}

// One statement of a run. Rows are not part of it: the webview asks for the ones it shows.
export interface ResultTab {
  readonly id: string
  readonly title: string
  readonly sql: string
  readonly kind: TabKind
  readonly status: TabStatus
  readonly columns: readonly ResultColumn[]
  // Rows in the current view, after its filters.
  readonly rowCount: number
  readonly loadedRows: number
  readonly view: ViewSpec
  // Changes whenever the rows of the view change: answers for an older version are dropped.
  readonly viewVersion: number
  readonly isServerView: boolean
  readonly canServerView: boolean
  // Whether the view offers to read the rows again, and with a condition (a WHERE): the rows of a
  // table opened from the explorer.
  readonly canRefresh: boolean
  // The condition the rows of a table are read with, as typed; empty without one.
  readonly tableFilter: string
  // The text of the quick search: the view shows the rows that hold it; empty without one.
  readonly search: string
  readonly summary: TabSummary | null
  readonly error: TabError | null
  readonly notice: string
  readonly plan: readonly string[]
  readonly editing: TabEditing
}

// A row as the grid gets it: long text is cut, and `truncated` lists the columns that were.
export interface WireRow {
  readonly cells: readonly CellValue[]
  readonly truncated: readonly number[]
}

// Rows and columns of the view, both ends included.
export interface CellRange {
  readonly firstRow: number
  readonly lastRow: number
  readonly firstColumn: number
  readonly lastColumn: number
}

export const HostMessageType = {
  Tabs: 'tabs',
  Tab: 'tab',
  Rows: 'rows',
  Cell: 'cell',
  Connection: 'connection',
} as const

export type HostMessage =
  | {
      readonly type: typeof HostMessageType.Tabs
      readonly tabs: readonly ResultTab[]
      readonly activeTabId: string | null
    }
  | { readonly type: typeof HostMessageType.Tab; readonly tab: ResultTab }
  | {
      readonly type: typeof HostMessageType.Rows
      readonly tabId: string
      readonly viewVersion: number
      readonly start: number
      readonly rows: readonly WireRow[]
    }
  | {
      readonly type: typeof HostMessageType.Cell
      readonly tabId: string
      readonly viewVersion: number
      readonly row: number
      readonly column: number
      readonly value: CellValue
    }
  | { readonly type: typeof HostMessageType.Connection; readonly connection: PanelConnection }

// The whole value of one cell, sent when the webview asks for a value it only holds cut.
export type CellMessage = Extract<HostMessage, { readonly type: typeof HostMessageType.Cell }>

export const WebviewMessageType = {
  Ready: 'ready',
  FetchRows: 'fetchRows',
  SetView: 'setView',
  Copy: 'copy',
  Export: 'export',
  FetchCell: 'fetchCell',
  Cancel: 'cancel',
  LoadAll: 'loadAll',
  Refresh: 'refresh',
  FilterTable: 'filterTable',
  Search: 'search',
  CopyColumnName: 'copyColumnName',
  Problem: 'problem',
  Edit: 'edit',
  PreviewEdits: 'previewEdits',
  ClosePreview: 'closePreview',
  ApplyEdits: 'applyEdits',
} as const

// An edit of the grid: the cells or rows of the view it acts on (null for adding a row and
// reverting everything), and what was typed, for setting a value.
export interface EditMessage {
  readonly kind: EditKind
  readonly range: CellRange | null
  readonly input: string
}

export type WebviewMessage =
  | { readonly type: typeof WebviewMessageType.Ready }
  | {
      readonly type: typeof WebviewMessageType.FetchRows
      readonly tabId: string
      readonly viewVersion: number
      readonly start: number
      readonly count: number
    }
  | {
      readonly type: typeof WebviewMessageType.SetView
      readonly tabId: string
      readonly view: ViewSpec
      readonly isServerSide: boolean
    }
  | {
      readonly type: typeof WebviewMessageType.Copy
      readonly tabId: string
      readonly viewVersion: number
      readonly range: CellRange
      readonly format: ExportFormat
    }
  | {
      readonly type: typeof WebviewMessageType.Export
      readonly tabId: string
      readonly format: ExportFormat
    }
  | {
      readonly type: typeof WebviewMessageType.FetchCell
      readonly tabId: string
      readonly viewVersion: number
      readonly row: number
      readonly column: number
    }
  | { readonly type: typeof WebviewMessageType.Cancel }
  // Runs the statement of the tab again without its automatic limit.
  | { readonly type: typeof WebviewMessageType.LoadAll; readonly tabId: string }
  // Reads the rows of the tab again, in its view.
  | { readonly type: typeof WebviewMessageType.Refresh; readonly tabId: string }
  // Reads the rows of a table again with this condition as their WHERE; an empty one reads them all.
  | {
      readonly type: typeof WebviewMessageType.FilterTable
      readonly tabId: string
      readonly condition: string
    }
  // Shows the rows of the view with this text in any column; an empty text shows them all.
  | {
      readonly type: typeof WebviewMessageType.Search
      readonly tabId: string
      readonly text: string
    }
  | {
      readonly type: typeof WebviewMessageType.CopyColumnName
      readonly tabId: string
      readonly column: number
    }
  // Something the webview could not handle, for the extension's log.
  | { readonly type: typeof WebviewMessageType.Problem; readonly message: string }
  // Edits name the view they were made on: one made on another view is dropped.
  | {
      readonly type: typeof WebviewMessageType.Edit
      readonly tabId: string
      readonly viewVersion: number
      readonly edit: EditMessage
    }
  | { readonly type: typeof WebviewMessageType.PreviewEdits; readonly tabId: string }
  | { readonly type: typeof WebviewMessageType.ClosePreview; readonly tabId: string }
  | {
      readonly type: typeof WebviewMessageType.ApplyEdits
      readonly tabId: string
      readonly previewId: number
    }

// The webview asks for at most this many rows at a time.
export const MAX_WINDOW_ROWS = 1000
