import { type ReactElement, useEffect, useRef } from 'react'

import { ValueType } from '../core/engine/table.ts'
import { ChoiceEditor } from './ChoiceEditor.tsx'
import { type CellEditorActions, onEditorKey } from './editor-keys.ts'
import type { CellEditorView } from './use-cell-editor.ts'

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
      {editor.spec.type === ValueType.Choice ? (
        <ChoiceEditor text={editor.text} label={label} spec={editor.spec} actions={actions} />
      ) : (
        <EditorInput
          text={editor.text}
          label={label}
          problemId={editor.problem === '' ? undefined : problemId}
          actions={actions}
        />
      )}
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
