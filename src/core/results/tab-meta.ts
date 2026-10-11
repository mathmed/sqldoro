// What the catalog says of the columns and rows of a tab, as the result view shows it: part of
// the messages between the extension host and the result webview (protocol.ts).
import type { CellValue } from '../engine/query.ts'

// What the catalog says of a column of a result, once the host knows it.
export interface ColumnMeta {
  // The values an enum or a set column takes; empty for any other column.
  readonly choices: readonly string[]
  // What a foreign key of the column points at, as people read it ("condominium (id)"); empty when
  // the column is in no foreign key the result holds.
  readonly reference: string
}

// A table whose foreign key points at the rows of a result: its rows reference them.
export interface RowReference {
  readonly label: string
}

// The referenced row a link of a cell leads to, a few of its columns, or why it cannot be shown.
export interface PeekView {
  readonly title: string
  readonly columns: readonly string[]
  readonly values: readonly CellValue[]
  readonly problem: string
}
