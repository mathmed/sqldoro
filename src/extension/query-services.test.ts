import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { FakeMemento, FakeSecretStorage } from '../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../test/fakes/logger.ts'
import { answerBy, type FakeCursor, type Page, pg } from '../../test/fakes/pg.ts'
import { answerQuickPicks } from '../../test/support/prompts.ts'
import { postedTabs } from '../../test/support/query.ts'
import {
  type CompletionList,
  env,
  type FakeTextEditor,
  FakeWebviewPanel,
  Position,
  resetVscode,
  settings,
  showEditor,
  Uri,
  webviewPanels,
  window,
  workspace,
} from '../../test/vscode.ts'
import { type ConnectionConfig, newConnection } from '../core/connection/connection.ts'
import { SecretKind } from '../core/connection/secrets.ts'
import { RunScope } from '../core/editor/run-plan.ts'
import { createQueryServices, type QueryServices } from './query-services.ts'
import { createServices, type Services } from './services.ts'

vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { FakeClient } = await import('../../test/fakes/pg.ts')
  return { default: { ...original.default, Client: FakeClient } }
})
vi.mock('pg-cursor', async () => {
  const { FakeCursor } = await import('../../test/fakes/pg.ts')
  return { default: FakeCursor }
})

const INT4 = 23
const ONE_ROW: Page = { fields: [{ name: 'one', dataTypeID: INT4 }], rows: [[1]], rowCount: 1 }
const NOT_CANCELLED = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: vi.fn() }),
}

interface Wired {
  readonly base: Services
  readonly query: QueryServices
  readonly connection: ConnectionConfig
}

async function wired(): Promise<Wired> {
  const log = recordingLogger()
  const globalState = new FakeMemento()
  const base = createServices({ globalState, secrets: new FakeSecretStorage() }, log)
  const connection: ConnectionConfig = {
    ...newConnection('shop', base.engines.get('postgres')),
    name: 'Shop',
    user: 'app',
    database: 'shop',
    isReadOnly: false,
  }
  await base.service.save(connection, new Map([[SecretKind.Password, 's3cret']]))
  const context = {
    extensionUri: Uri.file('/extension') as unknown as vscode.Uri,
    globalState,
    workspaceState: new FakeMemento(),
  }
  return { base, query: createQueryServices(context, base, log), connection }
}

async function boundEditor(query: QueryServices, sql: string): Promise<FakeTextEditor> {
  const document = await workspace.openTextDocument({ language: 'sql', content: sql })
  const uri = document.uri as unknown as vscode.Uri
  await query.bindings.set(uri, { connectionId: 'shop', database: 'shop', schema: 'public' })
  return showEditor(document)
}

// Runs the statement under the cursor with the result panel already loaded.
async function run(query: QueryServices, editor: FakeTextEditor): Promise<FakeWebviewPanel> {
  query.panels.show(editor.document.uri as unknown as vscode.Uri)
  const panel = webviewPanels.at(-1)
  if (!(panel instanceof FakeWebviewPanel)) {
    throw new Error('no result panel')
  }
  panel.webview.send({ type: 'ready' })
  await query.runner.run(editor as unknown as vscode.TextEditor, RunScope.Current)
  return panel
}

function firstPageOnly(page: Page): (cursor: FakeCursor) => Page {
  return (cursor) => (cursor.reads.length === 1 ? page : {})
}

beforeEach(() => {
  resetVscode()
  webviewPanels.length = 0
  pg.reset()
  window.showSaveDialog.mockReset()
})

describe('createQueryServices', () => {
  it('should run an editor on its own session with the saved secret, and record the statement', async () => {
    const { query } = await wired()
    pg.script.read = firstPageOnly(ONE_ROW)
    const editor = await boundEditor(query, 'SELECT 1 AS one')

    const panel = await run(query, editor)

    expect(pg.clients.map((client) => client.config.password)).toStrictEqual(['s3cret', 's3cret'])
    expect([...postedTabs(panel).values()]).toMatchObject([{ status: 'succeeded', rowCount: 1 }])
    expect(query.history.list()).toMatchObject([{ connectionId: 'shop', sql: 'SELECT 1 AS one' }])
    expect(query.historyView.getChildren()).toHaveLength(1)
  })

  it('should reload the connection in the explorer after a statement changes its schema', async () => {
    const { base, query } = await wired()
    await base.explorer.getChildren()
    const reloaded = vi.fn()
    base.explorer.onDidChangeTreeData(reloaded)
    pg.script.read = () => ({ command: 'CREATE' })

    await run(query, await boundEditor(query, 'CREATE TABLE t (id int)'))

    expect(reloaded).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'shop' }))
  })

  it('should answer the actions of the result panel', async () => {
    const { query } = await wired()
    pg.script.read = firstPageOnly(ONE_ROW)
    const panel = await run(query, await boundEditor(query, 'SELECT 1 AS one'))
    const [tabId = ''] = postedTabs(panel).keys()
    const range = { firstRow: 0, lastRow: 0, firstColumn: 0, lastColumn: 0 }

    panel.webview.send({ type: 'cancel' })
    panel.webview.send({ type: 'copy', tabId, viewVersion: 0, range, format: 'tsv' })
    await vi.waitFor(() => {
      expect(env.clipboard.writeText).toHaveBeenCalledOnce()
    })
    panel.webview.send({ type: 'export', tabId, format: 'csv' })
    await vi.waitFor(() => {
      expect(window.showSaveDialog).toHaveBeenCalledOnce()
    })
    panel.webview.send({
      type: 'setView',
      tabId,
      view: { sort: [{ column: 0, isDescending: true }], filters: [] },
      isServerSide: true,
    })
    await vi.waitFor(() => {
      expect(postedTabs(panel).get(tabId)).toMatchObject({ isServerView: true })
    })

    expect(window.showErrorMessage).not.toHaveBeenCalled()
  })

  it('should load every row of a result cut by the automatic limit', async () => {
    settings.set('sqldoro.autoLimit.rows', 1)
    const { query } = await wired()
    pg.script.read = (cursor) =>
      cursor.reads.length === 1 ? { ...ONE_ROW, rows: [[1]] } : { ...ONE_ROW, rows: [[2]] }
    const panel = await run(query, await boundEditor(query, 'SELECT 1 AS one'))
    const [tabId = ''] = postedTabs(panel).keys()

    panel.webview.send({ type: 'loadAll', tabId })

    await vi.waitFor(() => {
      expect(pg.clients.at(-1)?.cursors.map((cursor) => cursor.sql)).toStrictEqual([
        'SELECT 1 AS one LIMIT 2',
        'SELECT 1 AS one',
      ])
    })
  })

  it('should let the user pick the connection of an editor among the saved ones', async () => {
    const { query } = await wired()
    answerQuickPicks(undefined)

    await expect(query.pickBinding()).resolves.toBeUndefined()

    expect(window.showQuickPick).toHaveBeenCalledWith(
      [expect.objectContaining({ label: 'Shop' })],
      expect.anything(),
    )
  })

  it('should complete from the catalog of the connection open in the explorer', async () => {
    const { base, query, connection } = await wired()
    answerBy([['SELECT c.relname AS name FROM', { rows: [{ name: 'orders' }] }]])
    await base.sessions.connect(connection)
    const editor = await boundEditor(query, 'SELECT * FROM ')

    const list = (await query.completion.provideCompletionItems(
      editor.document as unknown as vscode.TextDocument,
      new Position(0, 14) as unknown as vscode.Position,
      NOT_CANCELLED,
    )) as CompletionList | undefined

    expect(list?.items.map((item) => item.label)).toContain('orders')
  })
})
