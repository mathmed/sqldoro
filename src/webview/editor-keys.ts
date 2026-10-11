import type { KeyboardEvent } from 'react'

// Where the focus goes once a value is in: how many columns it moves along the row of the cell.
export const EditorExit = {
  Stay: 0,
  Next: 1,
  Previous: -1,
} as const

export type EditorExit = (typeof EditorExit)[keyof typeof EditorExit]

export interface CellEditorActions {
  readonly change: (text: string) => void
  readonly commit: (exit: EditorExit) => void
  // Puts this value in at once: a pick of the list of an enum.
  readonly put: (text: string, exit: EditorExit) => void
  readonly cancel: () => void
}

export function onEditorKey(event: KeyboardEvent, actions: CellEditorActions): void {
  const exit = event.key === 'Tab' ? tabExit(event) : enterExit(event)
  if (exit === undefined && event.key !== 'Escape') {
    return
  }
  event.preventDefault()
  if (exit === undefined) {
    actions.cancel()
    return
  }
  actions.commit(exit)
}

function tabExit(event: KeyboardEvent): EditorExit {
  return event.shiftKey ? EditorExit.Previous : EditorExit.Next
}

function enterExit(event: KeyboardEvent): EditorExit | undefined {
  return event.key === 'Enter' && !event.shiftKey && !event.altKey ? EditorExit.Stay : undefined
}
