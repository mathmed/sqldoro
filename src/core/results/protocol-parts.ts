// The plain data the messages of the result view (protocol.ts) are made of: what a statement ended
// with, the connection a panel shows, the text of the query box, where a navigation starts.

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
  // The theme color of its badge (charts.blue), empty for none; production is red whatever it is.
  readonly color: string
}

// The server's message, and the place in the editor it points at (1-based) when it gave one.
export interface TabError {
  readonly message: string
  readonly line: number | null
  readonly column: number | null
}

// What the query box of a table panel shows with a tab: the statement of the rows of its table,
// with the values written in it and the LIMIT it was read with, or the query the user ran from the
// box (custom).
export interface QueryBoxText {
  readonly sql: string
  readonly isCustom: boolean
}

// Where a navigation starts: the row of a tab, and whether the rows it leads to open in place of
// the rows of the panel (table panels keep a trail of the steps to go back to) or in a panel of
// their own.
export interface NavigationStart {
  readonly tabId: string
  readonly viewVersion: number
  readonly row: number
  readonly isInPlace: boolean
}

// Where a statement is, for the view to say while it waits: the session opening, the server
// running it, its rows arriving, a cancel on its way, or done.
export const TabProgress = {
  Connecting: 'connecting',
  Running: 'running',
  Fetching: 'fetching',
  Cancelling: 'cancelling',
  Done: 'done',
} as const

export type TabProgress = (typeof TabProgress)[keyof typeof TabProgress]
