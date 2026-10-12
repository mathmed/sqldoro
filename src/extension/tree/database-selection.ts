import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { EditorBinding } from '../../core/editor/binding.ts'
import {
  changedScopes,
  type SelectableConnection,
  type SelectedScope,
  selectedScopes,
} from '../../core/editor/selection.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'

export interface DatabaseSelectionDependencies {
  readonly connections: () => readonly ConnectionConfig[]
  readonly engines: EngineRegistry
}

// The database (and schema) each connection marks in the explorer, following the SQL editor in
// front: it tells which marks changed, so that only their nodes are drawn again.
export class DatabaseSelection implements vscode.Disposable {
  readonly #dependencies: DatabaseSelectionDependencies
  readonly #changes = new vscode.EventEmitter<readonly SelectedScope[]>()
  #selected: ReadonlyMap<string, SelectedScope> = new Map()
  readonly onDidChange = this.#changes.event

  constructor(dependencies: DatabaseSelectionDependencies) {
    this.#dependencies = dependencies
  }

  selected(connectionId: string): SelectedScope | undefined {
    return this.#selected.get(connectionId)
  }

  // The editor in front, its binding or the connections changed: the binding of the SQL editor in
  // front, undefined when none is.
  follow(front: EditorBinding | undefined): void {
    const after = selectedScopes(this.#selectable(), front)
    const changed = changedScopes(this.#selected, after)
    this.#selected = after
    if (changed.length > 0) {
      this.#changes.fire(changed)
    }
  }

  dispose(): void {
    this.#changes.dispose()
  }

  #selectable(): SelectableConnection[] {
    const { connections, engines } = this.#dependencies
    return connections().flatMap(({ id, database, engine }) => {
      const known = engines.find(engine)
      return known === undefined ? [] : [{ id, database, dialect: known.dialect }]
    })
  }
}
