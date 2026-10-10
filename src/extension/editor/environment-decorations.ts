import * as vscode from 'vscode'

import { type ConnectionConfig, EnvironmentTag } from '../../core/connection/connection.ts'
import { ENVIRONMENT_LABELS, environmentBadge, environmentColor, labelOf } from '../labels.ts'
import type { EditorBindings } from './bindings.ts'

export interface EnvironmentDecorationsDependencies {
  readonly bindings: EditorBindings
  readonly connections: (id: string) => ConnectionConfig | undefined
}

// The tab of a SQL editor on a tagged connection shows the environment: its first letter as a
// badge, and its color (production in red).
export class EnvironmentDecorations implements vscode.FileDecorationProvider, vscode.Disposable {
  readonly #dependencies: EnvironmentDecorationsDependencies
  readonly #changes = new vscode.EventEmitter<undefined>()
  readonly onDidChangeFileDecorations = this.#changes.event

  constructor(dependencies: EnvironmentDecorationsDependencies) {
    this.#dependencies = dependencies
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const binding = this.#dependencies.bindings.get(uri)
    const connection =
      binding === undefined ? undefined : this.#dependencies.connections(binding.connectionId)
    if (connection === undefined || connection.environment === EnvironmentTag.None) {
      return undefined
    }
    const environment = labelOf(ENVIRONMENT_LABELS, connection.environment)
    const decoration = new vscode.FileDecoration(
      environmentBadge(connection.environment).charAt(0),
      `Runs on "${connection.name}" (${environment})`,
      environmentColor(connection.environment),
    )
    decoration.propagate = false
    return decoration
  }

  // Bindings and connections changed: every editor may show something else.
  refresh(): void {
    this.#changes.fire(undefined)
  }

  dispose(): void {
    this.#changes.dispose()
  }
}
