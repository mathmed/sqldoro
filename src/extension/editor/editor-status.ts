import * as vscode from 'vscode'

import { type ConnectionConfig, EnvironmentTag } from '../../core/connection/connection.ts'
import { bindingScope, describeBinding } from '../../core/editor/binding.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { type GuardPolicy, isProduction } from '../../core/safety/guard.ts'
import { CommandId, ContextKey, SQL_LANGUAGE } from '../command-id.ts'
import { ENVIRONMENT_LABELS, environmentBadge, environmentColor, labelOf } from '../labels.ts'
import type { EditorBindings } from './bindings.ts'
import type { QueryRunner } from './query-runner.ts'

export interface EditorStatusDependencies {
  readonly bindings: EditorBindings
  readonly runner: QueryRunner
  readonly connections: (id: string) => ConnectionConfig | undefined
  readonly engines: EngineRegistry
  readonly policy: () => GuardPolicy
}

interface Look {
  readonly text: string
  readonly tooltip: string
  readonly command: string
  // Production paints the item red; other environments color its text.
  readonly backgroundColor?: vscode.ThemeColor | undefined
  readonly color?: vscode.ThemeColor | undefined
}

const PRIORITY = 100
const PRODUCTION_BACKGROUND = 'statusBarItem.errorBackground'

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
    this.#item.backgroundColor = look.backgroundColor
    this.#item.color = look.color
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
    const badge = environmentBadge(connection.environment)
    const icon = connection.isReadOnly ? '$(lock)' : '$(database)'
    const prefix = badge === '' ? '' : `${badge} · `
    return {
      text: `${icon} ${prefix}${where}`,
      tooltip: `This editor runs on ${where} (${traitsOf(connection)}): click to change`,
      command: CommandId.ChangeConnection,
      ...this.#colorsOf(connection),
    }
  }

  #colorsOf(connection: ConnectionConfig): Pick<Look, 'backgroundColor' | 'color'> {
    return isProduction(connection.environment, this.#dependencies.policy())
      ? { backgroundColor: new vscode.ThemeColor(PRODUCTION_BACKGROUND) }
      : { color: environmentColor(connection.environment) }
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

// "Production, read-only", "writes allowed".
function traitsOf(connection: ConnectionConfig): string {
  const access = connection.isReadOnly ? 'read-only' : 'writes allowed'
  return connection.environment === EnvironmentTag.None
    ? access
    : `${labelOf(ENVIRONMENT_LABELS, connection.environment)}, ${access}`
}
