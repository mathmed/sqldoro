// The messages between the extension host and the result webview. Both sides validate what they
// receive (parse-host-message.ts, parse-webview-message.ts); values that may be absent are null,
// which survives the trip where undefined would not.
import type { CellValue, ResultColumn } from '../engine/query.ts'
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
}

// The server's message, and the place in the editor it points at (1-based) when it gave one.
export interface TabError {
  readonly message: string
  readonly line: number | null
  readonly column: number | null
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
  readonly summary: TabSummary | null
  readonly error: TabError | null
  readonly notice: string
  readonly plan: readonly string[]
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
  Problem: 'problem',
} as const

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
  // Something the webview could not handle, for the extension's log.
  | { readonly type: typeof WebviewMessageType.Problem; readonly message: string }

// The webview asks for at most this many rows at a time.
export const MAX_WINDOW_ROWS = 1000
