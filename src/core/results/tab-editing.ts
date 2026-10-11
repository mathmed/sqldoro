// Part of the messages between the extension host and the result webview (protocol.ts).
import type { PendingValue } from '../edits/pending.ts'
import type { ValueSpec } from '../engine/table.ts'

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
