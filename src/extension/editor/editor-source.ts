import type * as vscode from 'vscode'

import type { RunSource } from '../../core/editor/run-plan.ts'

// What a run reads from an editor: its text, its selection and its cursor, as offsets.
export function sourceOf(editor: vscode.TextEditor): RunSource {
  const { document, selection } = editor
  return {
    text: document.getText(),
    selectionStart: document.offsetAt(selection.start),
    selectionEnd: document.offsetAt(selection.end),
    cursor: document.offsetAt(selection.active),
  }
}
