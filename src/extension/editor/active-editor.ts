import * as vscode from 'vscode'

import type { EditorBinding } from '../../core/editor/binding.ts'
import { SQL_LANGUAGE } from '../command-id.ts'
import type { EditorBindings } from './bindings.ts'

// The SQL editor in front, or undefined after telling the user to open one.
export function activeSqlEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor
  if (editor?.document.languageId === SQL_LANGUAGE) {
    return editor
  }
  void vscode.window.showInformationMessage(
    'Open a SQL editor first: sqldoro runs the statements of SQL documents.',
  )
  return undefined
}

// Where the SQL editor in front runs; undefined when no SQL editor is in front, or it has no
// connection yet.
export function frontBinding(bindings: Pick<EditorBindings, 'get'>): EditorBinding | undefined {
  const editor = vscode.window.activeTextEditor
  return editor?.document.languageId === SQL_LANGUAGE
    ? bindings.get(editor.document.uri)
    : undefined
}
