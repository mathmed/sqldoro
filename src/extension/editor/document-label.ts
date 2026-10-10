import type * as vscode from 'vscode'

// How messages and titles name the document of an editor: the last part of its path.
export function documentLabel(uri: vscode.Uri): string {
  return uri.path.slice(uri.path.lastIndexOf('/') + 1)
}
