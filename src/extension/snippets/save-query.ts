import * as vscode from 'vscode'

import { freeName, type SavedQuery } from '../../core/snippets/saved-queries.ts'
import { SQL_LANGUAGE } from '../command-id.ts'
import { entryLabel, isHistoryEntryNode } from '../history/history-view.ts'
import type { Clock } from '../platform/clock.ts'
import type { SavedQueryLinks } from './saved-query-links.ts'
import { askQueryFolder, askQueryName } from './saved-query-prompts.ts'
import type { SavedQueryStore } from './saved-query-store.ts'

export interface SaveQueryContext {
  readonly store: SavedQueryStore
  readonly links: SavedQueryLinks
  readonly clock: Clock
  readonly createId: () => string
}

// The SQL a new saved query keeps, and the name the prompt starts from.
interface Draft {
  readonly title: string
  readonly sql: string
  readonly name: string
}

interface Place {
  readonly name: string
  readonly folder: string
}

const STATUS_MESSAGE_MS = 4000
const NOTHING_TO_SAVE = 'Open a SQL editor with a statement to save.'

// A statement of the query history becomes a new saved query. A SQL editor opened from a saved
// query updates it in place; any other SQL editor saves its selection, or all of it, as a new one.
export async function saveQuery(context: SaveQueryContext, target: unknown): Promise<void> {
  if (isHistoryEntryNode(target)) {
    const { entry } = target
    await saveNew(context, { title: 'Save Query', sql: entry.sql, name: entryLabel(entry) })
    return
  }
  const editor = sqlEditor()
  if (editor === undefined) {
    return
  }
  const linked = linkedQuery(context, editor.document)
  await (linked === undefined
    ? saveEditorAs(context, editor, { title: 'Save Query', name: '' })
    : updateQuery(context, linked, editor.document))
}

// Always a new saved query, named after the one the editor edits, if any.
export async function saveQueryAs(context: SaveQueryContext): Promise<void> {
  const editor = sqlEditor()
  if (editor !== undefined) {
    const name = linkedQuery(context, editor.document)?.name ?? ''
    await saveEditorAs(context, editor, { title: 'Save Query As', name })
  }
}

function sqlEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor
  if (editor?.document.languageId === SQL_LANGUAGE) {
    return editor
  }
  tellNothingToSave()
  return undefined
}

function linkedQuery(
  context: SaveQueryContext,
  document: vscode.TextDocument,
): SavedQuery | undefined {
  const id = context.links.queryOf(document.uri)
  return id === undefined ? undefined : context.store.find(id)
}

// The whole editor is the saved query from then on; a selection is only copied into it.
async function saveEditorAs(
  context: SaveQueryContext,
  editor: vscode.TextEditor,
  draft: Omit<Draft, 'sql'>,
): Promise<void> {
  const isWhole = editor.selection.isEmpty
  const sql = editor.document.getText(isWhole ? undefined : editor.selection).trim()
  const saved = await saveNew(context, { ...draft, sql })
  if (saved !== undefined && isWhole) {
    context.links.link(editor.document.uri, saved.id)
  }
}

async function saveNew(context: SaveQueryContext, draft: Draft): Promise<SavedQuery | undefined> {
  if (draft.sql === '') {
    tellNothingToSave()
    return undefined
  }
  const place = await askPlace(context, draft)
  if (place === undefined) {
    return undefined
  }
  const now = context.clock.timestamp()
  const query: SavedQuery = {
    id: context.createId(),
    name: freeName(context.store.list(), place.folder, place.name),
    folder: place.folder,
    sql: draft.sql,
    createdAt: now,
    updatedAt: now,
  }
  await context.store.put(query)
  confirmSaved(query)
  return query
}

async function askPlace(context: SaveQueryContext, draft: Draft): Promise<Place | undefined> {
  const name = await askQueryName(draft.title, draft.name)
  const folder =
    name === undefined ? undefined : await askQueryFolder(context.store, 'Save the Query in')
  return name === undefined || folder === undefined ? undefined : { name, folder }
}

// The whole editor replaces the SQL of the saved query, with no prompt; saving it unchanged
// changes nothing.
async function updateQuery(
  context: SaveQueryContext,
  query: SavedQuery,
  document: vscode.TextDocument,
): Promise<void> {
  const sql = document.getText().trim()
  if (sql === '') {
    tellNothingToSave()
    return
  }
  if (sql !== query.sql) {
    await context.store.put({ ...query, sql, updatedAt: context.clock.timestamp() })
  }
  confirmSaved(query)
}

function confirmSaved(query: SavedQuery): void {
  vscode.window.setStatusBarMessage(`$(check) Saved the query "${query.name}"`, STATUS_MESSAGE_MS)
}

function tellNothingToSave(): void {
  void vscode.window.showInformationMessage(NOTHING_TO_SAVE)
}
