// The edits of the grid wired end to end: the PostgreSQL driver over the fake of pg tells where the
// columns come from and describes the table, and the result view previews and applies a change.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { FakeMemento, FakeSecretStorage } from '../../test/fakes/extension-context.ts'
import { recordingLogger } from '../../test/fakes/logger.ts'
import { answerBy, type FakeCursor, type Page, pg } from '../../test/fakes/pg.ts'
import { postedTabs } from '../../test/support/query.ts'
import {
  FakeWebviewPanel,
  resetVscode,
  showEditor,
  Uri,
  webviewPanels,
  window,
  workspace,
} from '../../test/vscode.ts'
import { newConnection } from '../core/connection/connection.ts'
import { SecretKind } from '../core/connection/secrets.ts'
import { RunScope } from '../core/editor/run-plan.ts'
import { createQueryServices, type QueryServices } from './query-services.ts'
import { createServices } from './services.ts'

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
const TEXT = 25
const ORDERS = 16_510
const ORDERS_PAGE: Page = {
  fields: [
    { name: 'id', dataTypeID: INT4, tableID: ORDERS, columnID: 1 },
    { name: 'note', dataTypeID: TEXT, tableID: ORDERS, columnID: 2 },
  ],
  rows: [[1, 'gift']],
}

function column(reference: string, name: string, typeName: string): Record<string, unknown> {
  return {
    reference,
    name,
    dataType: typeName,
    typeName,
    typeType: 'b',
    category: 'N',
    isNullable: name === 'note',
    hasDefault: false,
    identity: '',
    generated: '',
    modifier: -1,
    labels: null,
  }
}

async function wired(): Promise<QueryServices> {
  const log = recordingLogger()
  const globalState = new FakeMemento()
  const base = createServices({ globalState, secrets: new FakeSecretStorage() }, log)
  const connection = {
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
  return createQueryServices(context, base, log)
}

// The orders the cursor reads, and how many rows each write changes.
function answerOrders(): void {
  pg.script.read = (cursor: FakeCursor) => {
    if (cursor.reads.length > 1) {
      return {}
    }
    return cursor.sql.startsWith('UPDATE') ? { command: 'UPDATE', rowCount: 1 } : ORDERS_PAGE
  }
  answerBy([
    [
      'SELECT n.nspname',
      { rows: [{ schema: 'sales', name: 'orders', kind: 'r', hasChildren: false }] },
    ],
    ['SELECT a.attnum', { rows: [column('1', 'id', 'int4'), column('2', 'note', 'text')] }],
    ['SELECT i.indexrelid', { rows: [{ index: '1', column: 'id', isNotNull: true }] }],
  ])
}

beforeEach(() => {
  resetVscode()
  webviewPanels.length = 0
  pg.reset()
  window.showInformationMessage.mockReset()
})

interface Editing {
  readonly state: string
  readonly preview: { readonly id: number } | null
  readonly notice: string
}

function editingIn(panel: FakeWebviewPanel): Editing {
  const [tab] = [...postedTabs(panel).values()]
  return tab?.['editing'] as Editing
}

function cursorSql(): string[] {
  return pg.clients.flatMap((client) => client.cursors.map((cursor) => cursor.sql))
}

async function editableOrders(query: QueryServices): Promise<FakeWebviewPanel> {
  const document = await workspace.openTextDocument({
    language: 'sql',
    content: 'SELECT id, note FROM sales.orders',
  })
  const uri = document.uri as unknown as vscode.Uri
  await query.bindings.set(uri, { connectionId: 'shop', database: 'shop', schema: 'sales' })
  const editor = showEditor(document)
  query.panels.show(uri)
  const panel = webviewPanels.at(-1)
  if (!(panel instanceof FakeWebviewPanel)) {
    throw new Error('no result panel')
  }
  panel.webview.send({ type: 'ready' })
  await query.runner.run(editor as unknown as vscode.TextEditor, RunScope.Current)
  await expect.poll(() => editingIn(panel).state).toBe('editable')
  return panel
}

describe('createQueryServices, editing', () => {
  it('should edit the rows of a table and apply the change in a transaction of its own', async () => {
    const query = await wired()
    answerOrders()
    const panel = await editableOrders(query)
    const [tabId = ''] = postedTabs(panel).keys()
    const range = { firstRow: 0, lastRow: 0, firstColumn: 1, lastColumn: 1 }

    panel.webview.send({
      type: 'edit',
      tabId,
      viewVersion: 0,
      edit: { kind: 'set', range, input: 'birthday' },
    })
    panel.webview.send({ type: 'previewEdits', tabId })
    await expect.poll(() => editingIn(panel).preview?.id).toBe(1)
    panel.webview.send({ type: 'applyEdits', tabId, previewId: 1 })
    await expect.poll(() => editingIn(panel).notice).toBe('Applied 1 update on sales.orders.')

    expect(cursorSql()).toStrictEqual([
      'SELECT id, note FROM sales.orders LIMIT 1001',
      'START TRANSACTION',
      'UPDATE "sales"."orders" SET "note" = $1 WHERE "id" = $2 AND "note" = $3',
      'COMMIT',
      'SELECT id, note FROM sales.orders LIMIT 1001',
    ])
  })

  it('should close the session of the editor when the changes cannot be rolled back', async () => {
    const query = await wired()
    answerOrders()
    const read = pg.script.read
    pg.script.read = (cursor, size) => {
      if (cursor.sql.startsWith('UPDATE')) {
        return { command: 'UPDATE', rowCount: 0 }
      }
      return cursor.sql === 'ROLLBACK'
        ? { error: new Error('connection lost') }
        : read(cursor, size)
    }
    const panel = await editableOrders(query)
    const [tabId = ''] = postedTabs(panel).keys()
    const range = { firstRow: 0, lastRow: 0, firstColumn: 1, lastColumn: 1 }

    panel.webview.send({
      type: 'edit',
      tabId,
      viewVersion: 0,
      edit: { kind: 'set', range, input: 'x' },
    })
    panel.webview.send({ type: 'previewEdits', tabId })
    await expect.poll(() => editingIn(panel).preview?.id).toBe(1)
    panel.webview.send({ type: 'applyEdits', tabId, previewId: 1 })
    await expect.poll(() => editingIn(panel).state).toBe('editable')

    expect(editingIn(panel).notice).toMatch(/closed the connection of this editor/)
    await expect.poll(() => pg.clients.filter((client) => client.isEnded)).toHaveLength(1)
  })
})
