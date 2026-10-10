import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { EditorBinding } from '../../core/editor/binding.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import type { Logger } from '../../core/platform.ts'
import { CommandId, SQL_LANGUAGE } from '../command-id.ts'
import { registerAll } from '../commands/command-context.ts'
import { withTimeout } from '../platform/timeout.ts'
import type { ResultsPanels } from '../results/results-panels.ts'
import type { ExplorerNode } from '../tree/explorer-node.ts'
import type { EditorBindings } from './bindings.ts'
import { explain } from './explain.ts'
import type { QueryRunner } from './query-runner.ts'

export interface EditorCommandContext {
  readonly runner: QueryRunner
  readonly bindings: EditorBindings
  readonly panels: ResultsPanels
  readonly connections: (id: string) => ConnectionConfig | undefined
  readonly pickBinding: () => Promise<EditorBinding | undefined>
  readonly log: Logger
}

// The result view must load in this time to count as open (the smoke test waits for it).
const READY_TIMEOUT_MS = 30_000

export function registerEditorCommands(context: EditorCommandContext): vscode.Disposable[] {
  return [
    ...registerAll(context, [
      { id: CommandId.NewQuery, action: 'New Query', run: newQuery },
      { id: CommandId.ChangeConnection, action: 'Change Connection', run: changeConnection },
      { id: CommandId.RunQuery, action: 'Run Query', run: runIn(RunScope.Current) },
      { id: CommandId.RunScript, action: 'Run Script', run: runIn(RunScope.All) },
      { id: CommandId.CancelQuery, action: 'Cancel Query', run: cancelQuery },
      { id: CommandId.Explain, action: 'Explain', run: explainIn(false) },
      { id: CommandId.ExplainAnalyze, action: 'Explain Analyze', run: explainIn(true) },
    ]),
    vscode.commands.registerCommand(CommandId.ShowResults, async () => showResults(context)),
  ]
}

function activeSqlEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor
  if (editor?.document.languageId === SQL_LANGUAGE) {
    return editor
  }
  void vscode.window.showInformationMessage(
    'Open a SQL editor first: sqldoro runs the statements of SQL documents.',
  )
  return undefined
}

// From the explorer, the editor runs in the database or schema of the node; from anywhere else, the
// user picks.
async function newQuery(context: EditorCommandContext, target: unknown): Promise<void> {
  const binding = bindingOfNode(context, target) ?? (await context.pickBinding())
  if (binding === undefined) {
    return
  }
  const document = await vscode.workspace.openTextDocument({ language: SQL_LANGUAGE, content: '' })
  await context.bindings.set(document.uri, binding)
  await vscode.window.showTextDocument(document)
}

function bindingOfNode(context: EditorCommandContext, target: unknown): EditorBinding | undefined {
  if (!isNode(target)) {
    return undefined
  }
  const connection = context.connections(target.connectionId)
  if (connection === undefined) {
    return undefined
  }
  const place = target.place ?? { database: connection.database, schema: '', name: '' }
  return { connectionId: connection.id, database: place.database, schema: place.schema }
}

function isNode(value: unknown): value is ExplorerNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'connectionId' in value &&
    typeof value.connectionId === 'string'
  )
}

async function changeConnection(context: EditorCommandContext): Promise<void> {
  const editor = activeSqlEditor()
  const binding = editor === undefined ? undefined : await context.pickBinding()
  if (editor !== undefined && binding !== undefined) {
    await context.bindings.set(editor.document.uri, binding)
  }
}

function runIn(scope: RunScope): (context: EditorCommandContext) => Promise<void> {
  return async (context) => {
    const editor = activeSqlEditor()
    if (editor !== undefined) {
      await context.runner.run(editor, scope)
    }
  }
}

async function cancelQuery(context: EditorCommandContext): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (editor !== undefined) {
    await context.runner.cancel(editor.document.uri)
  }
}

function explainIn(isAnalyze: boolean): (context: EditorCommandContext) => Promise<void> {
  return async (context) => {
    const editor = activeSqlEditor()
    if (editor !== undefined) {
      await explain(context.runner, editor, isAnalyze)
    }
  }
}

// Opens the result view of the editor; true once it has loaded.
async function showResults(context: EditorCommandContext): Promise<boolean> {
  const editor = activeSqlEditor()
  if (editor === undefined) {
    return false
  }
  const panel = context.panels.show(editor.document.uri)
  await withTimeout(panel.whenReady, READY_TIMEOUT_MS, 'The result view did not load')
  return true
}
