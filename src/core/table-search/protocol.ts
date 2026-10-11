// The messages between the extension host and the table search box, the webview above the
// Connections view. Both sides validate what they receive (parse-host-message.ts,
// parse-view-message.ts). The box only sends what is typed and what the user asks for; the host
// finds the tables and filters the explorer.
import type { SearchStatus } from './status.ts'

export const SearchViewMessageType = {
  // The box loaded: the host answers with the text and where the search stands.
  Ready: 'ready',
  // The text changed: sent on every keystroke.
  Search: 'search',
  // The box got the focus: the host starts loading the tables, so that typing finds them at once.
  Focused: 'focused',
  // Enter: opens the rows of the table or view that matches best.
  OpenBest: 'openBest',
  // Down arrow: moves to the table or view that matches best, in the explorer.
  FocusTree: 'focusTree',
  // A message from the host the box could not read, for the log.
  Problem: 'problem',
} as const

export type SearchViewMessage =
  | { readonly type: typeof SearchViewMessageType.Ready }
  | { readonly type: typeof SearchViewMessageType.Search; readonly text: string }
  | { readonly type: typeof SearchViewMessageType.Focused }
  | { readonly type: typeof SearchViewMessageType.OpenBest }
  | { readonly type: typeof SearchViewMessageType.FocusTree }
  | { readonly type: typeof SearchViewMessageType.Problem; readonly message: string }

export const SearchHostMessageType = {
  // Where the search stands: sent after every change of the text or of the tables loaded.
  Status: 'status',
  // Puts this text in the box: when it loads again, or when the filter is cleared elsewhere.
  SetText: 'setText',
  // Find Table in Explorer: the box takes the focus, its text selected.
  Focus: 'focus',
} as const

export type SearchHostMessage =
  | { readonly type: typeof SearchHostMessageType.Status; readonly status: SearchStatus }
  | { readonly type: typeof SearchHostMessageType.SetText; readonly text: string }
  | { readonly type: typeof SearchHostMessageType.Focus }
