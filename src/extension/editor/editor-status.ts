import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { bindingScope, describeBinding } from '../../core/editor/binding.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { CommandId, ContextKey, SQL_LANGUAGE } from '../command-id.ts'
import type { EditorBindings } from './bindings.ts'
import type { QueryRunner } from './query-runner.ts'

export interface EditorStatusDependencies {
  readonly bindings: EditorBindings
  readonly runner: QueryRunner
  readonly connections: (id: string) => ConnectionConfig | undefined
  readonly engines: EngineRegistry
}

interface Look {
  readonly text: string
  readonly tooltip: string
  readonly command: string
}

const PRIORITY = 100

// The status bar tells which connection, database and schema the SQL editor in front runs on; a
// click changes them, or cancels the query that runs.
export class EditorStatus implements vscode.Disposable {
  readonly #dependencies: EditorStatusDependencies
  readonly #item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, PRIORITY)

  constructor(dependencies: EditorStatusDependencies) {
    this.#dependencies = dependencies
    this.#item.name = 'sqldoro Connection'
  }

  update(): void {
    const editor = vscode.window.activeTextEditor
    if (editor?.document.languageId !== SQL_LANGUAGE) {
      this.#item.hide()
      this.#setContext(false, false)
      return
    }
    const connection = this.#connectionOf(editor.document.uri)
    const isRunning = this.#dependencies.runner.isRunning(editor.document.uri)
    const look = isRunning ? this.#running(connection) : this.#idle(editor.document.uri, connection)
    this.#item.text = look.text
    this.#item.tooltip = look.tooltip
    this.#item.command = look.command
    this.#item.show()
    this.#setContext(connection !== undefined, isRunning)
  }

  dispose(): void {
    this.#item.dispose()
  }

  #connectionOf(uri: vscode.Uri): ConnectionConfig | undefined {
    const binding = this.#dependencies.bindings.get(uri)
    return binding === undefined ? undefined : this.#dependencies.connections(binding.connectionId)
  }

  #idle(uri: vscode.Uri, connection: ConnectionConfig | undefined): Look {
    const binding = this.#dependencies.bindings.get(uri)
    if (connection === undefined || binding === undefined) {
      return {
        text: '$(plug) Choose a connection',
        tooltip: 'Choose the connection of this SQL editor',
        command: CommandId.ChangeConnection,
      }
    }
    const { dialect } = this.#dependencies.engines.get(connection.engine)
    const where = describeBinding(
      connection.name,
      bindingScope(binding, dialect),
      dialect.hasSchemas,
    )
    return {
      text: `$(database) ${where}`,
      tooltip: `This editor runs on ${where}: click to change`,
      command: CommandId.ChangeConnection,
    }
  }

  #running(connection: ConnectionConfig | undefined): Look {
    const name = connection?.name ?? ''
    return {
      text: `$(loading~spin) ${name}`,
      tooltip: 'A query is running: click to cancel it',
      command: CommandId.CancelQuery,
    }
  }

  #setContext(hasConnection: boolean, isRunning: boolean): void {
    void vscode.commands.executeCommand('setContext', ContextKey.EditorHasConnection, hasConnection)
    void vscode.commands.executeCommand('setContext', ContextKey.IsQueryRunning, isRunning)
  }
}
