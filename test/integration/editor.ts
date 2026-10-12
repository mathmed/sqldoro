// The extension host wired as in VS Code (createServices, createQueryServices) on a real server: a
// SQL editor runs a query, its result panel edits the rows, and the user previews and applies the
// changes there.
import { expect } from 'vitest'
import type * as vscode from 'vscode'

import { type ConnectionConfig, newConnection } from '../../src/core/connection/connection.ts'
import { SecretKind } from '../../src/core/connection/secrets.ts'
import { RunScope } from '../../src/core/editor/run-plan.ts'
import type { EditKind } from '../../src/core/edits/edit-kind.ts'
import type { ObjectRef } from '../../src/core/engine/catalog.ts'
import type { CellBlock } from '../../src/core/results/protocol.ts'
import type { ResultSet } from '../../src/core/results/result-set.ts'
import { CommandId } from '../../src/extension/command-id.ts'
import { createQueryServices, type QueryServices } from '../../src/extension/query-services.ts'
import { createServices, type Services } from '../../src/extension/services.ts'
import { registerTableDataCommands } from '../../src/extension/tables/table-data.ts'
import { tableUri } from '../../src/extension/tables/table-uri.ts'
import { FakeMemento, FakeSecretStorage } from '../fakes/extension-context.ts'
import { recordingLogger } from '../fakes/logger.ts'
import { postedTabs } from '../support/query.ts'
import { commands, FakeWebviewPanel, showEditor, Uri, webviewPanels, workspace } from '../vscode.ts'
import type { DatabaseServer } from './servers.ts'

export interface EditorTarget {
  readonly engineId: string
  readonly server: DatabaseServer
  readonly schema: string
  readonly sql: string
}

export interface EditingView {
  readonly state: string
  readonly problem: string
  readonly preview: { readonly id: number; readonly summary: string } | null
  readonly notice: string
  readonly isNoticeError: boolean
  readonly rows: readonly { readonly row: number; readonly problem: string }[]
}

export interface GridEditor {
  readonly base: Services
  readonly query: QueryServices
  readonly uri: vscode.Uri
  readonly panel: FakeWebviewPanel
  readonly tabId: string
}

export const CONNECTION_NAME = 'Integration'

// The connection to the server, writable unless the test says otherwise.
function connectionTo(
  base: Services,
  target: EditorTarget,
  changes: Partial<ConnectionConfig>,
): ConnectionConfig {
  return {
    ...newConnection('it', base.engines.get(target.engineId)),
    name: CONNECTION_NAME,
    host: target.server.endpoint.host,
    port: target.server.endpoint.port,
    user: target.server.user,
    database: target.server.database,
    isReadOnly: false,
    ...changes,
  }
}

async function wired(
  target: EditorTarget,
  changes: Partial<ConnectionConfig>,
): Promise<{ readonly base: Services; readonly query: QueryServices }> {
  const log = recordingLogger()
  const globalState = new FakeMemento()
  const base = createServices(
    {
      globalState,
      secrets: new FakeSecretStorage(),
      extensionUri: Uri.file('/extension') as unknown as vscode.Uri,
    },
    log,
  )
  await base.service.save(
    connectionTo(base, target, changes),
    new Map([[SecretKind.Password, target.server.password]]),
  )
  const context = {
    extensionUri: Uri.file('/extension') as unknown as vscode.Uri,
    globalState,
    workspaceState: new FakeMemento(),
  }
  return { base, query: createQueryServices(context, base, log) }
}

export function editingOf(editor: GridEditor): EditingView {
  return postedTabs(editor.panel).get(editor.tabId)?.['editing'] as EditingView
}

function viewVersionOf(editor: GridEditor): unknown {
  return postedTabs(editor.panel).get(editor.tabId)?.['viewVersion']
}

// Runs the query of the target in a new SQL editor, and waits until the grid knows whether its rows
// can be edited.
export async function openGrid(
  target: EditorTarget,
  changes: Partial<ConnectionConfig> = {},
): Promise<GridEditor> {
  const { base, query } = await wired(target, changes)
  const document = await workspace.openTextDocument({ language: 'sql', content: target.sql })
  const uri = document.uri as unknown as vscode.Uri
  await query.bindings.set(uri, {
    connectionId: 'it',
    database: target.server.database,
    schema: target.schema,
  })
  const textEditor = showEditor(document)
  query.panels.show(uri)
  const panel = webviewPanels.at(-1)
  if (!(panel instanceof FakeWebviewPanel)) {
    throw new Error('no result panel')
  }
  panel.webview.send({ type: 'ready' })
  await query.runner.run(textEditor as unknown as vscode.TextEditor, RunScope.All)
  const [tabId = ''] = postedTabs(panel).keys()
  const editor = { base, query, uri, panel, tabId }
  await expect.poll(() => editingOf(editor).state).toMatch(/^(editable|readOnly)$/)
  return editor
}

// Opens a table of the server as the explorer does, and waits until the grid knows whether its rows
// can be edited.
export async function openTableGrid(target: EditorTarget, table: ObjectRef): Promise<GridEditor> {
  const { base, query } = await wired(target, {})
  registerTableDataCommands(query.tables)
  const node = { kind: 'table', connectionId: 'it', place: table }
  const opening = commands.executeCommand(CommandId.OpenTableData, node)
  const panel = webviewPanels.at(-1)
  if (!(panel instanceof FakeWebviewPanel)) {
    throw new Error('no table panel')
  }
  panel.webview.send({ type: 'ready' })
  await opening
  const [tabId = ''] = postedTabs(panel).keys()
  const uri = tableUri({ connectionId: 'it', table, instance: '' })
  const editor = { base, query, uri, panel, tabId }
  await expect.poll(() => editingOf(editor).state).toMatch(/^(editable|readOnly)$/)
  return editor
}

export function cell(row: number, column: number): CellBlock {
  return { firstRow: row, lastRow: row, columns: [column] }
}

// What the result view sends when the user edits the rows.
export function edit(
  editor: GridEditor,
  change: { readonly kind: EditKind; readonly block: CellBlock | null; readonly input?: string },
): void {
  editor.panel.webview.send({
    type: 'edit',
    tabId: editor.tabId,
    viewVersion: viewVersionOf(editor),
    edit: { input: '', ...change },
  })
}

// Previews the changes, applies the preview and waits until the apply is over: refused, or applied
// and the rows read again (the notice of the apply comes back once they are).
export async function previewAndApply(editor: GridEditor): Promise<EditingView> {
  editor.panel.webview.send({ type: 'previewEdits', tabId: editor.tabId })
  await expect.poll(() => editingOf(editor).preview).not.toBeNull()
  const preview = editingOf(editor).preview
  const version = viewVersionOf(editor)
  editor.panel.webview.send({ type: 'applyEdits', tabId: editor.tabId, previewId: preview?.id })
  await expect.poll(() => isApplyOver(editor, version)).toBe(true)
  return editingOf(editor)
}

function isApplyOver(editor: GridEditor, version: unknown): boolean {
  const editing = editingOf(editor)
  const isSettled = editing.notice !== '' && editing.state === 'editable'
  return isSettled && (editing.isNoticeError || isReadAgain(editor, version))
}

function isReadAgain(editor: GridEditor, version: unknown): boolean {
  const tab = postedTabs(editor.panel).get(editor.tabId) ?? {}
  return tab['viewVersion'] !== version && tab['status'] === 'succeeded'
}

// The rows the tab holds now, as the query returned them.
export function tabRows(editor: GridEditor): readonly unknown[] {
  const tab: ResultSet | undefined = editor.query.panels.get(editor.uri)?.tab(editor.tabId)
  return Array.from({ length: tab?.rowCount ?? 0 }, (...[, index]) => tab?.sourceRow(index))
}

export async function closeGrid(editor: GridEditor): Promise<void> {
  await editor.query.editorSessions.releaseAll()
  await editor.base.sessions.disconnectAll()
}
