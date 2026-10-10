import * as vscode from 'vscode'

import { SQL_LANGUAGE } from '../command-id.ts'

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
