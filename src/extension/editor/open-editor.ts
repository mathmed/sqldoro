import * as vscode from 'vscode'

import type { EditorBinding } from '../../core/editor/binding.ts'
import { SQL_LANGUAGE } from '../command-id.ts'
import type { EditorBindings } from './bindings.ts'

// A new SQL editor with the statement, on the connection given (if any).
export async function openQueryEditor(
  bindings: EditorBindings,
  sql: string,
  binding: EditorBinding | undefined,
): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ language: SQL_LANGUAGE, content: sql })
  if (binding !== undefined) {
    await bindings.set(document.uri, binding)
  }
  return vscode.window.showTextDocument(document)
}
