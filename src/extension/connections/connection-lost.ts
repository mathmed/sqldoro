import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'

export function showConnectionLost(connection: ConnectionConfig, message: string): void {
  void vscode.window.showWarningMessage(`${connection.name}: ${message}`)
}
