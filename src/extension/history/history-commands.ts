import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { EditorBinding } from '../../core/editor/binding.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import { type HistoryEntry, searchHistory } from '../../core/history/history.ts'
import type { Logger } from '../../core/platform.ts'
import { CommandId } from '../command-id.ts'
import { registerAll } from '../commands/command-context.ts'
import type { EditorBindings } from '../editor/bindings.ts'
import { openQueryEditor } from '../editor/open-editor.ts'
import type { QueryRunner } from '../editor/query-runner.ts'
import { askChoice, askText } from '../form/prompts.ts'
import type { HistoryStore } from './history-store.ts'
import { entryLabel, entryTime, HistoryNodeKind, isHistoryEntryNode } from './history-view.ts'

export interface HistoryCommandContext {
  readonly history: HistoryStore
  readonly bindings: EditorBindings
  readonly runner: QueryRunner
  readonly connections: (id: string) => ConnectionConfig | undefined
  readonly log: Logger
}

const CLEAR_BUTTON = 'Clear History'
const ACTIONS = [
  { label: '$(go-to-file) Open in Editor', value: CommandId.OpenHistoryEntry },
  { label: '$(play) Run Again', value: CommandId.RunHistoryEntry },
  { label: '$(copy) Copy SQL', value: CommandId.CopyHistoryEntry },
] as const

export function registerHistoryCommands(context: HistoryCommandContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.OpenHistoryEntry, action: 'Open History Entry', run: withEntry(openEntry) },
    { id: CommandId.RunHistoryEntry, action: 'Run History Entry', run: withEntry(runEntry) },
    { id: CommandId.CopyHistoryEntry, action: 'Copy History Entry', run: withEntry(copyEntry) },
    {
      id: CommandId.DeleteHistoryEntry,
      action: 'Delete History Entry',
      run: withEntry(deleteEntry),
    },
    { id: CommandId.ClearHistory, action: 'Clear History', run: clearHistory },
    { id: CommandId.SearchHistory, action: 'Search History', run: search },
  ])
}

type EntryAction = (context: HistoryCommandContext, entry: HistoryEntry) => Promise<void>

// Commands get the history node from the view, or nothing from the Command Palette: then the user
// picks the entry.
function withEntry(
  action: EntryAction,
): (context: HistoryCommandContext, target: unknown) => Promise<void> {
  return async (context, target) => {
    await actOn(action, context, entryOf(context, target) ?? (await pickEntry(context)))
  }
}

async function actOn(
  action: EntryAction,
  context: HistoryCommandContext,
  entry: HistoryEntry | undefined,
): Promise<void> {
  if (entry !== undefined) {
    await action(context, entry)
  }
}

// The entry as stored now: a node of the view may be older than the last change.
function entryOf(context: HistoryCommandContext, target: unknown): HistoryEntry | undefined {
  return isHistoryEntryNode(target) ? context.history.find(target.entry.id) : undefined
}

// The statement goes back to an editor on its connection, database and schema, if they still exist.
function bindingOf(context: HistoryCommandContext, entry: HistoryEntry): EditorBinding | undefined {
  const connection = context.connections(entry.connectionId)
  return connection === undefined
    ? undefined
    : { connectionId: connection.id, database: entry.database, schema: entry.schema }
}

async function openEntry(context: HistoryCommandContext, entry: HistoryEntry): Promise<void> {
  await openQueryEditor(context.bindings, entry.sql, bindingOf(context, entry))
}

async function runEntry(context: HistoryCommandContext, entry: HistoryEntry): Promise<void> {
  const editor = await openQueryEditor(context.bindings, entry.sql, bindingOf(context, entry))
  await context.runner.run(editor, RunScope.All)
}

async function copyEntry(...[, entry]: Parameters<EntryAction>): Promise<void> {
  await vscode.env.clipboard.writeText(entry.sql)
}

async function deleteEntry(context: HistoryCommandContext, entry: HistoryEntry): Promise<void> {
  await context.history.remove(entry.id)
}

async function clearHistory(context: HistoryCommandContext): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    'Clear the query history of every connection?',
    { modal: true },
    CLEAR_BUTTON,
  )
  if (choice === CLEAR_BUTTON) {
    await context.history.clear()
  }
}

async function pickEntry(
  context: HistoryCommandContext,
  entries: readonly HistoryEntry[] = context.history.list(),
): Promise<HistoryEntry | undefined> {
  if (entries.length === 0) {
    void vscode.window.showInformationMessage('No statement of the query history matches.')
    return undefined
  }
  const picked = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: entryLabel(entry),
      description: `${context.connections(entry.connectionId)?.name ?? ''} · ${entryTime(entry)}`,
      ...(entry.message === '' ? {} : { detail: entry.message }),
      entry,
    })),
    { title: 'Query History', matchOnDescription: true, matchOnDetail: true, ignoreFocusOut: true },
  )
  return picked?.entry
}

// Finds the statements (and error messages) holding every word typed, then opens, runs or copies
// the one picked.
async function search(context: HistoryCommandContext): Promise<void> {
  const query = await askText({
    title: 'Search Query History',
    prompt: 'Words the statement or its error message holds',
    value: '',
    placeHolder: 'For example: orders where',
  })
  const entry =
    query === undefined
      ? undefined
      : await pickEntry(context, searchHistory(context.history.list(), query))
  const action =
    entry === undefined ? undefined : await askChoice('What to do with the statement', ACTIONS)
  if (entry !== undefined && action !== undefined) {
    await vscode.commands.executeCommand(action, { kind: HistoryNodeKind.Entry, entry })
  }
}
