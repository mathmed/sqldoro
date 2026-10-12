import * as vscode from 'vscode'

import type { SelectedScope } from '../../core/editor/selection.ts'

// The URIs of the connections, databases and schemas of the Connections view: VS Code colors and
// badges their labels through the decorations of these URIs. They name the node, never a value.
export const EXPLORER_SCHEME = 'sqldoro-explorer'

function explorerUri(parts: readonly string[]): vscode.Uri {
  const path = parts.map((part) => `/${encodeURIComponent(part)}`).join('')
  return vscode.Uri.from({ scheme: EXPLORER_SCHEME, path })
}

export function connectionUri(connectionId: string): vscode.Uri {
  return explorerUri(['connection', connectionId])
}

export function databaseUri(connectionId: string, database: string): vscode.Uri {
  return explorerUri(['database', connectionId, database])
}

export function schemaUri(connectionId: string, database: string, schema: string): vscode.Uri {
  return explorerUri(['schema', connectionId, database, schema])
}

// The nodes that show a mark: its database, and its schema where the engine has schemas.
export function scopeUris({ connectionId, database, schema }: SelectedScope): vscode.Uri[] {
  return [databaseUri(connectionId, database), schemaUri(connectionId, database, schema)]
}

export function isSameUri(left: vscode.Uri, right: vscode.Uri): boolean {
  return left.scheme === right.scheme && left.path === right.path
}
