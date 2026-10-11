import * as vscode from 'vscode'

import {
  ConnectionColor,
  type ConnectionConfig,
  EnvironmentTag,
} from '../../core/connection/connection.ts'
import { connectionTint, ENVIRONMENT_LABELS, labelOf } from '../../core/connection/labels.ts'
import { type GuardPolicy, isProduction } from '../../core/safety/guard.ts'
import { environmentBadge } from '../labels.ts'
import type { EditorBindings } from './bindings.ts'

export interface EnvironmentDecorationsDependencies {
  readonly bindings: EditorBindings
  readonly connections: (id: string) => ConnectionConfig | undefined
  readonly policy: () => GuardPolicy
}

// The badge of a connection with a color and no environment.
const COLOR_BADGE = '●'

// The tab of a SQL editor on a tagged or colored connection shows it: the first letter of the
// environment (or a dot) as a badge, in the color of the connection (production in red).
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
    return connection === undefined ? undefined : this.#decorationOf(connection)
  }

  #decorationOf(connection: ConnectionConfig): vscode.FileDecoration | undefined {
    const isTagged = connection.environment !== EnvironmentTag.None
    if (!isTagged && connection.color === ConnectionColor.None) {
      return undefined
    }
    const environment = labelOf(ENVIRONMENT_LABELS, connection.environment)
    const tint = connectionTint(
      connection,
      isProduction(connection.environment, this.#dependencies.policy()),
    )
    const decoration = new vscode.FileDecoration(
      isTagged ? environmentBadge(connection.environment).charAt(0) : COLOR_BADGE,
      isTagged ? `Runs on "${connection.name}" (${environment})` : `Runs on "${connection.name}"`,
      new vscode.ThemeColor(tint),
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
