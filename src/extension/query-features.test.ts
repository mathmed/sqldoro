import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { FakeMemento, FakeSecretStorage } from '../../test/fakes/extension-context.ts'
import { pg } from '../../test/fakes/pg.ts'
import {
  closeDocument,
  completionProviders,
  contentProviders,
  diagnosticCollections,
  type FakeTextDocument,
  type FakeWebviewPanel,
  outputChannels,
  Position,
  Range,
  resetVscode,
  showEditor,
  statusBarItems,
  webviewPanels,
  window,
  workspace,
} from '../../test/vscode.ts'
import { CommandId } from './command-id.ts'
import { activate, deactivate } from './extension.ts'

vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { FakeClient } = await import('../../test/fakes/pg.ts')
  return { default: { ...original.default, Client: FakeClient } }
})
vi.mock('pg-cursor', async () => {
  const { FakeCursor } = await import('../../test/fakes/pg.ts')
  return { default: FakeCursor }
})

const SHOP = {
  id: 'shop',
  name: 'Shop',
  engine: 'postgres',
  host: '127.0.0.1',
  port: 1,
  user: 'app',
  database: 'shop',
  ssl: { mode: 'disable', caPath: '', certPath: '', keyPath: '', shouldRejectUnauthorized: true },
  environment: 'none',
  isReadOnly: true,
}

const subscriptions: vscode.Disposable[] = []
let workspaceState: FakeMemento

async function activated(): Promise<void> {
  const globalState = new FakeMemento()
  await globalState.update('sqldoro.connections', { version: 1, connections: [SHOP] })
  activate({
    extensionMode: vscode.ExtensionMode.Production,
    subscriptions,
    globalState,
    workspaceState,
    secrets: new FakeSecretStorage(),
    extensionUri: vscode.Uri.file('/extension'),
    extension: { id: 'mathmed.sqldoro', packageJSON: { version: '0.1.0' } },
  })
}

async function newQueryEditor(): Promise<FakeTextDocument> {
  await vscode.commands.executeCommand(CommandId.NewQuery, {
    connectionId: 'shop',
    place: { database: 'shop', schema: 'public', name: '' },
  })
  const document = window.activeTextEditor?.document
  if (document === undefined) {
    throw new Error('no editor')
  }
  return document
}

// The id of the tab a result panel shows last.
function tabIdIn(panel: FakeWebviewPanel): string {
  const tabs = panel.webview.posted.flatMap((message) => {
    const { type, tab } = message as { type: string; tab?: { id: string } }
    return type === 'tab' && tab !== undefined ? [tab.id] : []
  })
  return tabs.at(-1) ?? ''
}

function statusText(): string | undefined {
  return statusBarItems.find((item) => item.name === 'sqldoro Connection')?.text
}

beforeEach(() => {
  resetVscode()
  pg.reset()
  webviewPanels.length = 0
  window.showWarningMessage.mockReset()
  workspaceState = new FakeMemento()
})

afterEach(() => {
  for (const subscription of subscriptions.splice(0)) {
    subscription.dispose()
  }
})

describe('the SQL editor features', () => {
  it('should register the autocomplete for SQL and the DDL documents', async () => {
    await activated()

    expect(completionProviders).toMatchObject([
      { selector: { language: 'sql' }, triggers: ['.', '"', '`'] },
    ])
    expect(contentProviders.has('sqldoro-ddl')).toBe(true)
  })

  it('should follow the editor in front in the status bar', async () => {
    await activated()
    expect(statusBarItems.at(-1)?.isVisible).toBe(false)

    await newQueryEditor()

    expect(statusText()).toBe('$(lock) Shop › shop.public')
    showEditor(await workspace.openTextDocument({ language: 'sql', content: '' }))
    expect(statusText()).toBe('$(plug) Choose a connection')
  })

  it('should give back the results, errors and connection of a closed editor', async () => {
    await activated()
    const document = await newQueryEditor()
    const shown = vscode.commands.executeCommand(CommandId.ShowResults)
    webviewPanels[0]?.webview.send({ type: 'ready' })
    await shown
    diagnosticCollections[0]?.set(document.uri, [])

    closeDocument(document)

    expect(webviewPanels[0]?.isDisposed).toBe(true)
    expect(diagnosticCollections[0]?.entries.size).toBe(0)
  })

  it('should log a closed editor whose connection could not be forgotten', async () => {
    await activated()
    const document = await newQueryEditor()
    vi.spyOn(workspaceState, 'update').mockRejectedValue(new Error('disk full'))

    closeDocument(document)

    await vi.waitFor(() => {
      expect(outputChannels[0]?.warn).toHaveBeenCalledWith(
        'Could not forget the connection of a closed editor: disk full',
      )
    })
  })

  it('should forget the editors of a deleted connection, and log what fails', async () => {
    await activated()
    const document = await newQueryEditor()
    window.showWarningMessage.mockResolvedValue('Delete')

    await vscode.commands.executeCommand(CommandId.DeleteConnection, 'shop')

    showEditor(document)
    expect(statusText()).toBe('$(plug) Choose a connection')
  })

  it('should log a deleted connection whose editors could not be forgotten', async () => {
    await activated()
    await newQueryEditor()
    window.showWarningMessage.mockResolvedValue('Delete')
    vi.spyOn(workspaceState, 'update').mockRejectedValue(new Error('disk full'))

    await vscode.commands.executeCommand(CommandId.DeleteConnection, 'shop')

    await vi.waitFor(() => {
      expect(outputChannels[0]?.warn).toHaveBeenCalledWith(
        'Could not forget a deleted connection: disk full',
      )
    })
  })

  it('should keep the connection of an editor while its connection is up, and close it on Disconnect', async () => {
    await activated()
    await newQueryEditor()
    await window.activeTextEditor?.edit((builder) => {
      builder.replace(new Range(new Position(0, 0), new Position(0, 0)), 'SELECT 1')
    })

    await vscode.commands.executeCommand(CommandId.RunQuery)
    const editorClient = pg.clients.at(-1)
    expect(pg.clients).toHaveLength(2)
    expect(editorClient?.isEnded).toBe(false)

    await vscode.commands.executeCommand(CommandId.Disconnect, 'shop')
    await vi.waitFor(() => {
      expect(editorClient?.isEnded).toBe(true)
    })
  })

  it('should show a change of the connection in the results of its editors at once', async () => {
    await activated()
    await newQueryEditor()
    await window.activeTextEditor?.edit((builder) => {
      builder.replace(new Range(new Position(0, 0), new Position(0, 0)), 'SELECT 1')
    })
    await vscode.commands.executeCommand(CommandId.RunQuery)
    webviewPanels[0]?.webview.send({ type: 'ready' })
    window.showWarningMessage.mockResolvedValue('Allow Writes')

    await vscode.commands.executeCommand(CommandId.AllowWrites, 'shop')

    expect(webviewPanels[0]?.webview.posted.at(-1)).toMatchObject({
      type: 'connection',
      connection: { name: 'Shop', isReadOnly: false },
    })
  })

  it('should open a table on a connection of its own, read it again, and close it on Disconnect', async () => {
    await activated()
    const orders = { database: 'shop', schema: 'public', name: 'orders' }
    const opening = vscode.commands.executeCommand(CommandId.OpenTableData, {
      kind: 'table',
      connectionId: 'shop',
      place: orders,
    })
    const [panel] = webviewPanels
    if (panel === undefined) {
      throw new Error('no table panel')
    }
    panel.webview.send({ type: 'ready' })
    await opening
    const tableClient = pg.clients.at(-1)
    expect(panel.title).toBe('orders — public')
    expect(tableClient?.cursors.map((cursor) => cursor.sql)).toStrictEqual([
      'SELECT * FROM "public"."orders" LIMIT 1001',
    ])

    panel.webview.send({ type: 'refresh', tabId: tabIdIn(panel) })
    await vi.waitFor(() => {
      expect(tableClient?.cursors).toHaveLength(2)
    })

    await vscode.commands.executeCommand(CommandId.Disconnect, 'shop')
    expect(panel.isDisposed).toBe(true)
    await vi.waitFor(() => {
      expect(tableClient?.isEnded).toBe(true)
    })
  })

  it('should let editor connections go when the connection is disconnected, and on deactivate', async () => {
    await activated()

    await vscode.commands.executeCommand(CommandId.Disconnect, 'shop')
    await vscode.commands.executeCommand(CommandId.Refresh)

    await expect(deactivate()).resolves.toBeUndefined()
  })
})
