import * as vscode from 'vscode'

import type { Logger } from '../../core/platform.ts'
import {
  exportQueries,
  folderPaths,
  freeName,
  importQueries,
  normalizeFolder,
  queryNameProblem,
  type SavedQuery,
} from '../../core/snippets/saved-queries.ts'
import { CommandId, SQL_LANGUAGE } from '../command-id.ts'
import { registerAll } from '../commands/command-context.ts'
import type { EditorBindings } from '../editor/bindings.ts'
import { openQueryEditor } from '../editor/open-editor.ts'
import { askChoice, askText } from '../form/prompts.ts'
import type { Clock } from '../platform/clock.ts'
import type { SavedQueryStore } from './saved-query-store.ts'
import { SavedQueryNodeKind } from './saved-query-view.ts'

export interface SavedQueryCommandContext {
  readonly store: SavedQueryStore
  readonly bindings: EditorBindings
  readonly clock: Clock
  readonly createId: () => string
  readonly log: Logger
}

const NEW_FOLDER = Symbol('new folder')
const DELETE_BUTTON = 'Delete'
const JSON_FILTERS = { 'Saved queries': ['json'] }
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function registerSavedQueryCommands(context: SavedQueryCommandContext): vscode.Disposable[] {
  return registerAll(context, [
    { id: CommandId.SaveQuery, action: 'Save Query', run: saveQuery },
    { id: CommandId.OpenSavedQuery, action: 'Open Saved Query', run: withQuery(openQuery) },
    { id: CommandId.InsertSavedQuery, action: 'Insert Saved Query', run: withQuery(insertQuery) },
    { id: CommandId.RenameSavedQuery, action: 'Rename Saved Query', run: withQuery(renameQuery) },
    { id: CommandId.MoveSavedQuery, action: 'Move Saved Query', run: withQuery(moveQuery) },
    { id: CommandId.DeleteSavedQuery, action: 'Delete Saved Query', run: withQuery(deleteQuery) },
    { id: CommandId.ExportSavedQueries, action: 'Export Saved Queries', run: exportAll },
    { id: CommandId.ImportSavedQueries, action: 'Import Saved Queries', run: importFile },
  ])
}

type QueryAction = (context: SavedQueryCommandContext, query: SavedQuery) => Promise<void>

function isQueryNode(value: unknown): value is { readonly query: SavedQuery } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === SavedQueryNodeKind.Query &&
    'query' in value
  )
}

// From the view, the node's query (as stored now); from the Command Palette, the one the user picks.
function withQuery(
  action: QueryAction,
): (context: SavedQueryCommandContext, target: unknown) => Promise<void> {
  return async (context, target) => {
    const query = isQueryNode(target)
      ? context.store.find(target.query.id)
      : await pickQuery(context)
    await actOn(action, context, query)
  }
}

async function actOn(
  action: QueryAction,
  context: SavedQueryCommandContext,
  query: SavedQuery | undefined,
): Promise<void> {
  if (query !== undefined) {
    await action(context, query)
  }
}

async function pickQuery(context: SavedQueryCommandContext): Promise<SavedQuery | undefined> {
  const queries = context.store.list()
  if (queries.length === 0) {
    void vscode.window.showInformationMessage(
      'There is no saved query yet: save one from a SQL editor.',
    )
    return undefined
  }
  return askChoice(
    'Choose a Saved Query',
    queries.map((query) => ({ label: query.name, description: query.folder, value: query })),
  )
}

// The selection of the SQL editor, or all of it, under a name and in a folder.
async function saveQuery(context: SavedQueryCommandContext): Promise<void> {
  const sql = editorSql()
  if (sql === undefined) {
    return
  }
  const name = await askName('Save Query', '')
  const folder = name === undefined ? undefined : await askFolder(context, 'Save the Query in')
  if (name === undefined || folder === undefined) {
    return
  }
  const now = context.clock.timestamp()
  const saved = context.store.list()
  await context.store.put({
    id: context.createId(),
    name: freeName(saved, folder, name),
    folder,
    sql,
    createdAt: now,
    updatedAt: now,
  })
}

function editorSql(): string | undefined {
  const editor = vscode.window.activeTextEditor
  const sql = editor?.document.languageId === SQL_LANGUAGE ? textToSave(editor) : ''
  if (sql === '') {
    void vscode.window.showInformationMessage('Open a SQL editor with a statement to save.')
    return undefined
  }
  return sql
}

// The selection, or the whole document when nothing is selected.
function textToSave(editor: vscode.TextEditor): string {
  const range = editor.selection.isEmpty ? undefined : editor.selection
  return editor.document.getText(range).trim()
}

async function askName(title: string, value: string): Promise<string | undefined> {
  const name = await askText({
    title,
    prompt: 'The name of the saved query',
    value,
    placeHolder: 'For example: Orders of the day',
    validate: queryNameProblem,
  })
  return name?.trim()
}

async function askFolder(
  context: SavedQueryCommandContext,
  title: string,
): Promise<string | undefined> {
  const choice = await askChoice<string | typeof NEW_FOLDER>(title, [
    { label: '$(root-folder) Top level', value: '' },
    ...folderPaths(context.store.list()).map((path) => ({
      label: `$(folder) ${path}`,
      value: path,
    })),
    { label: '$(new-folder) New Folder…', value: NEW_FOLDER },
  ])
  if (choice !== NEW_FOLDER) {
    return choice
  }
  const folder = await askText({
    title: 'New Folder',
    prompt: 'Folders nest with /',
    value: '',
    placeHolder: 'For example: reports/monthly',
  })
  return folder === undefined ? undefined : normalizeFolder(folder)
}

// A saved query opens in a new editor on the connection of the SQL editor in front, if any.
async function openQuery(context: SavedQueryCommandContext, query: SavedQuery): Promise<void> {
  const active = vscode.window.activeTextEditor
  const binding = active === undefined ? undefined : context.bindings.get(active.document.uri)
  await openQueryEditor(context.bindings, query.sql, binding)
}

async function insertQuery(...[, query]: Parameters<QueryAction>): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (editor?.document.languageId !== SQL_LANGUAGE) {
    void vscode.window.showInformationMessage('Open the SQL editor to insert the query in first.')
    return
  }
  await editor.edit((builder) => {
    builder.replace(editor.selection, query.sql)
  })
}

async function renameQuery(context: SavedQueryCommandContext, query: SavedQuery): Promise<void> {
  const name = await askName('Rename Saved Query', query.name)
  if (name !== undefined && name !== query.name) {
    const others = context.store.list().filter((saved) => saved.id !== query.id)
    await context.store.put({
      ...query,
      name: freeName(others, query.folder, name),
      updatedAt: context.clock.timestamp(),
    })
  }
}

async function moveQuery(context: SavedQueryCommandContext, query: SavedQuery): Promise<void> {
  const folder = await askFolder(context, `Move "${query.name}" to`)
  if (folder !== undefined && folder !== query.folder) {
    const others = context.store.list().filter((saved) => saved.id !== query.id)
    await context.store.put({
      ...query,
      folder,
      name: freeName(others, folder, query.name),
      updatedAt: context.clock.timestamp(),
    })
  }
}

async function deleteQuery(context: SavedQueryCommandContext, query: SavedQuery): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    `Delete the saved query "${query.name}"?`,
    { modal: true },
    DELETE_BUTTON,
  )
  if (choice === DELETE_BUTTON) {
    await context.store.delete(query.id)
  }
}

async function exportAll(context: SavedQueryCommandContext): Promise<void> {
  const uri = await vscode.window.showSaveDialog({
    title: 'Export Saved Queries',
    saveLabel: 'Export',
    filters: JSON_FILTERS,
  })
  if (uri !== undefined) {
    await vscode.workspace.fs.writeFile(uri, encoder.encode(exportQueries(context.store.list())))
    void vscode.window.showInformationMessage(
      `Exported ${String(context.store.list().length)} saved queries.`,
    )
  }
}

// The file is read and checked entry by entry: what cannot be read is reported, the rest joins
// the saved queries.
async function importFile(context: SavedQueryCommandContext): Promise<void> {
  const uri = await askImportFile()
  if (uri === undefined) {
    return
  }
  const text = decoder.decode(await vscode.workspace.fs.readFile(uri))
  const result = importQueries(text, context.store.list(), context.createId)
  if (result.added > 0) {
    await context.store.replaceAll(result.queries)
  }
  reportImport(context, result.added, result.problems)
}

async function askImportFile(): Promise<vscode.Uri | undefined> {
  const files = await vscode.window.showOpenDialog({
    title: 'Import Saved Queries',
    openLabel: 'Import',
    canSelectMany: false,
    filters: JSON_FILTERS,
  })
  return files?.at(0)
}

function reportImport(
  context: SavedQueryCommandContext,
  added: number,
  problems: readonly string[],
): void {
  for (const problem of problems) {
    context.log.warn(problem)
  }
  const message = `Imported ${String(added)} saved queries.`
  void (problems.length === 0
    ? vscode.window.showInformationMessage(message)
    : vscode.window.showWarningMessage(`${message} ${problems.join(' ')}`))
}
