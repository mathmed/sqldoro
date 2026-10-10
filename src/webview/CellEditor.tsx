import { type KeyboardEvent, type ReactElement, useEffect, useRef } from 'react'

import type { CellEditorView } from './use-cell-editor.ts'

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
  readonly cancel: () => void
}

interface CellEditorProps {
  readonly editor: CellEditorView
  readonly label: string
  readonly actions: CellEditorActions
}

// The value of a cell as text: Enter puts it in (Shift+Enter starts a new line), Tab puts it in and
// moves on, Escape leaves the cell as it was. What the column cannot hold is said as it is typed.
export const CellEditor = ({ editor, label, actions }: CellEditorProps): ReactElement => {
  if (editor.text === undefined) {
    return <span className="cell-editor-loading">Loading…</span>
  }
  const problemId = `editor-problem-${String(editor.position.row)}-${String(editor.position.column)}`
  return (
    <span className="cell-editor-box">
      <EditorInput
        text={editor.text}
        label={label}
        problemId={editor.problem === '' ? undefined : problemId}
        actions={actions}
      />
      {editor.problem === '' ? null : (
        <span id={problemId} role="alert" className="cell-editor-problem">
          {editor.problem}
        </span>
      )}
    </span>
  )
}

interface EditorInputProps {
  readonly text: string
  readonly label: string
  readonly problemId: string | undefined
  readonly actions: CellEditorActions
}

const EditorInput = ({ text, label, problemId, actions }: EditorInputProps): ReactElement => {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  return (
    <textarea
      ref={inputRef}
      className="cell-editor"
      aria-label={label}
      aria-invalid={problemId !== undefined}
      aria-describedby={problemId}
      rows={1}
      value={text}
      onChange={(event) => {
        actions.change(event.target.value)
      }}
      onKeyDown={(event) => {
        onEditorKey(event, actions)
      }}
      onMouseDown={(event) => {
        event.stopPropagation()
      }}
    />
  )
}

function onEditorKey(event: KeyboardEvent, actions: CellEditorActions): void {
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
