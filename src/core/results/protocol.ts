// The messages between the extension host and the result webview. Both sides validate what they
// receive (parse-host-message.ts, parse-webview-message.ts); values that may be absent are null,
// which survives the trip where undefined would not.
import type { EditKind } from '../edits/edit-kind.ts'
import type { CellValue, ResultColumn } from '../engine/query.ts'
import type { ColumnLayout } from '../grid/column-layout.ts'
import type { Crumb } from '../navigation/history.ts'
import type { LexicalRules } from '../sql/lexical-rules.ts'
import type { ExportFormat } from './export-format.ts'
import type {
  NavigationStart,
  PanelConnection,
  QueryBoxText,
  TabError,
  TabSummary,
} from './protocol-parts.ts'
import type { TabEditing } from './tab-editing.ts'
import type { ColumnMeta, PeekView, RowReference } from './tab-meta.ts'
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

// Where a statement is, for the view to say while it waits: the session opening, the server
// running it, its rows arriving, or done.
export const TabProgress = {
  Connecting: 'connecting',
  Running: 'running',
  Fetching: 'fetching',
  Done: 'done',
} as const

export type TabProgress = (typeof TabProgress)[keyof typeof TabProgress]

// One statement of a run. Rows are not part of it: the webview asks for the ones it shows.
export interface ResultTab {
  readonly id: string
  readonly title: string
  readonly sql: string
  readonly kind: TabKind
  readonly status: TabStatus
  readonly progress: TabProgress
  readonly columns: readonly ResultColumn[]
  // What the catalog says of each column, in order; empty until the host knows it.
  readonly meta: readonly ColumnMeta[]
  // The tables that reference the rows, where the result holds the columns they reference.
  readonly references: readonly RowReference[]
  // The columns the grid shows, and in which order.
  readonly layout: ColumnLayout
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
  // What the query box shows with the tab: tabs of table panels only, null elsewhere.
  readonly queryBox: QueryBoxText | null
}

// A row as the grid gets it: long text is cut, and `truncated` lists the columns that were.
export interface WireRow {
  readonly cells: readonly CellValue[]
  readonly truncated: readonly number[]
}

// Rows of the view, both ends included, and columns of the result in the order they are shown: the
// grid may hide and move columns.
export interface CellBlock {
  readonly firstRow: number
  readonly lastRow: number
  readonly columns: readonly number[]
}

export const HostMessageType = {
  Tabs: 'tabs',
  Tab: 'tab',
  Rows: 'rows',
  Cell: 'cell',
  Connection: 'connection',
  Trail: 'trail',
  Peek: 'peek',
  ReferenceCounts: 'referenceCounts',
  Distinct: 'distinct',
  Sql: 'sql',
  QueryBox: 'queryBox',
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
  // The trail of a table panel reached by navigation, the step shown last.
  | { readonly type: typeof HostMessageType.Trail; readonly crumbs: readonly Crumb[] }
  | {
      readonly type: typeof HostMessageType.Peek
      readonly tabId: string
      readonly viewVersion: number
      readonly row: number
      readonly column: number
      readonly peek: PeekView
    }
  // How many rows of each referencing table reference a row, as decimal text; null where the count
  // failed.
  | {
      readonly type: typeof HostMessageType.ReferenceCounts
      readonly tabId: string
      readonly viewVersion: number
      readonly row: number
      readonly counts: readonly (string | null)[]
    }
  // The values a column holds in the rows fetched, for the filter of the column to pick from.
  | {
      readonly type: typeof HostMessageType.Distinct
      readonly tabId: string
      readonly column: number
      readonly values: readonly string[]
      // False when there were more values than the list holds.
      readonly isComplete: boolean
    }
  // How the SQL of the connection is written, for the WHERE of a table to color and complete it.
  | {
      readonly type: typeof HostMessageType.Sql
      readonly identifierQuote: string
      readonly lexical: LexicalRules
      readonly keywords: readonly string[]
    }
  // What the query box of a table panel works with: the tables and views of the schema of its
  // table, to complete, and the height the user gave the box (null for the default).
  | {
      readonly type: typeof HostMessageType.QueryBox
      readonly tables: readonly string[]
      readonly height: number | null
    }

// The whole value of one cell, sent when the webview asks for a value it only holds cut.
export type CellMessage = Extract<HostMessage, { readonly type: typeof HostMessageType.Cell }>

export type PeekMessage = Extract<HostMessage, { readonly type: typeof HostMessageType.Peek }>

export type ReferenceCountsMessage = Extract<
  HostMessage,
  { readonly type: typeof HostMessageType.ReferenceCounts }
>

export type DistinctMessage = Extract<
  HostMessage,
  { readonly type: typeof HostMessageType.Distinct }
>

export type SqlMessage = Extract<HostMessage, { readonly type: typeof HostMessageType.Sql }>

export type QueryBoxMessage = Extract<
  HostMessage,
  { readonly type: typeof HostMessageType.QueryBox }
>

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
  SetLayout: 'setLayout',
  Navigate: 'navigate',
  OpenReference: 'openReference',
  CountReferences: 'countReferences',
  Peek: 'peek',
  GoToStep: 'goToStep',
  AllowWrites: 'allowWrites',
  OpenInEditor: 'openInEditor',
  FetchDistinct: 'fetchDistinct',
  RunQuery: 'runQuery',
  OpenSqlInEditor: 'openSqlInEditor',
  SetQueryHeight: 'setQueryHeight',
} as const

// An edit of the grid: the cells or rows of the view it acts on (null for adding a row and
// reverting everything), and what was typed, for setting a value.
export interface EditMessage {
  readonly kind: EditKind
  readonly block: CellBlock | null
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
      readonly block: CellBlock
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
  // The columns the grid shows and their order: a table panel keeps them for its table.
  | {
      readonly type: typeof WebviewMessageType.SetLayout
      readonly tabId: string
      readonly layout: ColumnLayout
    }
  // Opens the row a link of a cell (a foreign key) points at.
  | NavigateMessage
  // Opens the rows of a referencing table (by its place among the references of the tab) that
  // reference a row.
  | OpenReferenceMessage
  | {
      readonly type: typeof WebviewMessageType.CountReferences
      readonly tabId: string
      readonly viewVersion: number
      readonly row: number
    }
  | {
      readonly type: typeof WebviewMessageType.Peek
      readonly tabId: string
      readonly viewVersion: number
      readonly row: number
      readonly column: number
    }
  // Shows a step of the trail of a table panel again.
  | { readonly type: typeof WebviewMessageType.GoToStep; readonly step: number }
  // Asks to allow writes on the connection of the panel (a confirmed change of its own).
  | { readonly type: typeof WebviewMessageType.AllowWrites }
  // Opens the statement of a table panel in an SQL editor.
  | { readonly type: typeof WebviewMessageType.OpenInEditor; readonly tabId: string }
  | {
      readonly type: typeof WebviewMessageType.FetchDistinct
      readonly tabId: string
      readonly column: number
    }
  // Runs the text of the query box of a table panel, through the guards, in place of its rows.
  | { readonly type: typeof WebviewMessageType.RunQuery; readonly sql: string }
  // Opens this text (of the query box) in a new SQL editor, on the connection of the panel.
  | { readonly type: typeof WebviewMessageType.OpenSqlInEditor; readonly sql: string }
  // The height the user gave the query box, kept for the table panels of the workspace.
  | { readonly type: typeof WebviewMessageType.SetQueryHeight; readonly height: number }

interface NavigateMessage extends NavigationStart {
  readonly type: typeof WebviewMessageType.Navigate
  readonly column: number
}

interface OpenReferenceMessage extends NavigationStart {
  readonly type: typeof WebviewMessageType.OpenReference
  readonly reference: number
}

// The webview asks for at most this many rows at a time.
export const MAX_WINDOW_ROWS = 1000

// The filter of a column offers at most this many of its values.
export const MAX_DISTINCT_VALUES = 500

// The query box is at most this tall, in pixels; what the webview asks beyond is refused.
export const MAX_QUERY_HEIGHT = 4000
