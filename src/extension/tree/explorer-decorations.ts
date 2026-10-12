import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { connectionTint } from '../../core/connection/labels.ts'
import { type SelectedScope, SelectionSource } from '../../core/editor/selection.ts'
import { type GuardPolicy, isProduction } from '../../core/safety/guard.ts'
import type { DatabaseSelection } from './database-selection.ts'
import { SELECTED_COLOR } from './node-icons.ts'
import { connectionUri, EXPLORER_SCHEME, isSameUri, scopeUris } from './node-uris.ts'

export interface ExplorerDecorationsDependencies {
  readonly connections: () => readonly ConnectionConfig[]
  readonly selection: Pick<DatabaseSelection, 'onDidChange' | 'selected'>
  readonly policy: () => GuardPolicy
}

// The badge of the database the SQL editor in front runs on.
const EDITOR_BADGE = '●'
const EDITOR_TOOLTIP = 'The SQL editor in front runs here'
const DEFAULT_TOOLTIP = 'New queries on this connection run here'

// The labels of the Connections view in color: a connection in its color (production in red, as its
// editors' tabs), and the database the SQL editor in front runs on in the accent, with a dot.
export class ExplorerDecorations implements vscode.FileDecorationProvider, vscode.Disposable {
  readonly #dependencies: ExplorerDecorationsDependencies
  readonly #changes = new vscode.EventEmitter<vscode.Uri[] | undefined>()
  readonly #subscription: vscode.Disposable
  readonly onDidChangeFileDecorations = this.#changes.event

  constructor(dependencies: ExplorerDecorationsDependencies) {
    this.#dependencies = dependencies
    this.#subscription = dependencies.selection.onDidChange((scopes) => {
      this.#changes.fire(scopes.flatMap(scopeUris))
    })
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== EXPLORER_SCHEME) {
      return undefined
    }
    const connections = this.#dependencies.connections()
    return (
      this.#connectionDecoration(uri, connections) ?? this.#selectionDecoration(uri, connections)
    )
  }

  // The connections, their colors or the production environments changed.
  refresh(): void {
    this.#changes.fire(undefined)
  }

  dispose(): void {
    this.#subscription.dispose()
    this.#changes.dispose()
  }

  #connectionDecoration(
    uri: vscode.Uri,
    connections: readonly ConnectionConfig[],
  ): vscode.FileDecoration | undefined {
    const connection = connections.find(({ id }) => isSameUri(connectionUri(id), uri))
    if (connection === undefined) {
      return undefined
    }
    const tint = connectionTint(
      connection,
      isProduction(connection.environment, this.#dependencies.policy()),
    )
    return tint === '' ? undefined : decoration({ color: tint })
  }

  #selectionDecoration(
    uri: vscode.Uri,
    connections: readonly ConnectionConfig[],
  ): vscode.FileDecoration | undefined {
    const scope = connections
      .map(({ id }) => this.#dependencies.selection.selected(id))
      .find((selected) => selected !== undefined && isMarked(selected, uri))
    return scope === undefined ? undefined : selectionDecoration(scope)
  }
}

function isMarked(scope: SelectedScope, uri: vscode.Uri): boolean {
  return scopeUris(scope).some((marked) => isSameUri(marked, uri))
}

function selectionDecoration({ source }: SelectedScope): vscode.FileDecoration {
  return source === SelectionSource.Editor
    ? decoration({ color: SELECTED_COLOR, badge: EDITOR_BADGE, tooltip: EDITOR_TOOLTIP })
    : decoration({ color: SELECTED_COLOR, tooltip: DEFAULT_TOOLTIP })
}

interface Look {
  readonly color: string
  readonly badge?: string
  readonly tooltip?: string
}

function decoration({ color, badge, tooltip }: Look): vscode.FileDecoration {
  const made = new vscode.FileDecoration(badge, tooltip, new vscode.ThemeColor(color))
  made.propagate = false
  return made
}
