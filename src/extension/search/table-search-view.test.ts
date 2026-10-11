import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { explorer, SHOP } from '../../../test/support/explorer.ts'
import {
  builtInCalls,
  type FakeTreeView,
  FakeWebviewView,
  resetVscode,
  Uri,
  window,
} from '../../../test/vscode.ts'
import { CommandId, ViewId } from '../command-id.ts'
import { TableSearchView } from './table-search-view.ts'

const CATALOG = {
  listSchemas: async () => Promise.resolve([{ name: 'sales' }]),
  listTables: async () => Promise.resolve([{ name: 'orders' }, { name: 'lines' }]),
  listViews: async () => Promise.resolve([]),
}

interface Harness extends Omit<ReturnType<typeof explorer>, 'sut'> {
  readonly sut: TableSearchView
  readonly explorerView: ReturnType<typeof explorer>['sut']
  readonly tree: FakeTreeView
  readonly box: FakeWebviewView
}

// A search box over an explorer of the connected Shop, shown by VS Code.
async function shown(session: object = CATALOG): Promise<Harness> {
  const found = explorer([SHOP], { session })
  await found.sessions.connect(SHOP)
  const tree = window.createTreeView(ViewId.Connections, { treeDataProvider: found.sut })
  const sut = new TableSearchView({
    extensionUri: Uri.file('/ext') as unknown as vscode.Uri,
    explorer: found.sut,
    tree,
    log: found.log,
  })
  const box = new FakeWebviewView(ViewId.TableSearch)
  sut.resolveWebviewView(box as unknown as vscode.WebviewView)
  return { ...found, sut, explorerView: found.sut, tree, box }
}

// Plays a message of the box, and lets the host answer it.
async function fromBox(box: FakeWebviewView, message: unknown): Promise<void> {
  box.webview.send(message)
  await new Promise((resolve) => {
    setImmediate(resolve)
  })
}

function postedOfType(box: FakeWebviewView, type: string): unknown[] {
  return box.webview.posted.filter(
    (message) =>
      typeof message === 'object' && message !== null && 'type' in message && message.type === type,
  )
}

beforeEach(() => {
  resetVscode()
})

describe('TableSearchView', () => {
  it('should load the box from its own bundle, under the strict policy of the webviews', async () => {
    const { box } = await shown()

    expect(box.webview.options).toStrictEqual({
      enableScripts: true,
      localResourceRoots: [Uri.file('/ext/dist/webview')],
    })
    expect(box.webview.html).toContain('webview:/ext/dist/webview/table-search.js')
    expect(box.webview.html).toContain('webview:/ext/dist/webview/table-search.css')
    expect(box.webview.html).toContain("script-src 'nonce-")
  })

  it('should give a box that loads the text kept and where the search stands', async () => {
    const { box, explorerView, index } = await shown()
    explorerView.setFind('ord ')
    await index.load()
    expect(box.webview.posted).toStrictEqual([])

    await fromBox(box, { type: 'ready' })

    expect(box.webview.posted).toStrictEqual([
      { type: 'setText', text: 'ord ' },
      {
        type: 'status',
        status: { text: 'ord ', matchCount: 1, connectionCount: 1, isLoading: false },
      },
    ])
  })

  it('should filter the explorer on every keystroke, without sending the text back', async () => {
    const { box, explorerView, index } = await shown()
    await fromBox(box, { type: 'ready' })

    await fromBox(box, { type: 'search', text: 'l' })
    await fromBox(box, { type: 'search', text: 'li' })
    await index.load()

    expect(explorerView.find).toBe('li')
    expect(postedOfType(box, 'setText')).toStrictEqual([{ type: 'setText', text: '' }])
    expect(postedOfType(box, 'status').at(-1)).toStrictEqual({
      type: 'status',
      status: { text: 'li', matchCount: 1, connectionCount: 1, isLoading: false },
    })
  })

  it('should put in the box a text cleared elsewhere', async () => {
    const { box, explorerView } = await shown()
    await fromBox(box, { type: 'ready' })
    await fromBox(box, { type: 'search', text: 'ord' })

    explorerView.setFind('')

    expect(postedOfType(box, 'setText').at(-1)).toStrictEqual({ type: 'setText', text: '' })
  })

  it('should start loading the tables as soon as the box has the focus', async () => {
    const listTables = vi.fn(CATALOG.listTables)
    const { box, index } = await shown({ ...CATALOG, listTables })

    await fromBox(box, { type: 'focused' })
    await index.load()

    expect(listTables).toHaveBeenCalledOnce()
  })

  it('should open the rows of the best match on Enter', async () => {
    const openTableData = vi.fn()
    vscode.commands.registerCommand(CommandId.OpenTableData, openTableData)
    const { box, index } = await shown()
    await fromBox(box, { type: 'openBest' })
    await fromBox(box, { type: 'search', text: 'lines' })
    await index.load()

    await fromBox(box, { type: 'openBest' })

    expect(openTableData).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: 'table',
        connectionId: 'shop',
        place: { database: 'shop', schema: 'sales', name: 'lines' },
      }),
    )
  })

  it('should move to the best match on the down arrow, or to the explorer', async () => {
    const { box, index, tree, explorerView } = await shown()
    await fromBox(box, { type: 'focusTree' })
    await fromBox(box, { type: 'search', text: 'orders' })
    await index.load()

    await fromBox(box, { type: 'focusTree' })

    expect(builtInCalls).toContainEqual({ command: 'sqldoro.connections.focus', args: [] })
    expect(tree.reveal).toHaveBeenCalledExactlyOnceWith(explorerView.bestMatch(), {
      select: true,
      focus: true,
    })
  })

  it('should log what the box reports, and what it sends that cannot be read', async () => {
    const { box, log } = await shown()
    const exploding = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('broken message')
        },
      },
    )

    await fromBox(box, { type: 'problem', message: 'The box cannot read a message' })
    await fromBox(box, { type: 'search' })
    await fromBox(box, exploding)

    expect(log.warn.mock.calls).toStrictEqual([
      ['The box cannot read a message'],
      ['The table search sent a message sqldoro cannot read: "text" must be a string'],
    ])
    expect(log.error).toHaveBeenCalledWith('The table search failed: broken message')
  })

  it('should post nothing to a box VS Code dropped, and fill the one it shows next', async () => {
    const { sut, box, explorerView } = await shown()
    await fromBox(box, { type: 'ready' })
    const next = new FakeWebviewView(ViewId.TableSearch)
    const posted = box.webview.posted.length

    sut.resolveWebviewView(next as unknown as vscode.WebviewView)
    box.dispose()
    explorerView.setFind('ord')
    await fromBox(next, { type: 'ready' })
    const nextPosted = next.webview.posted.length
    next.dispose()
    explorerView.setFind('orders')
    sut.dispose()

    expect(box.webview.posted).toHaveLength(posted)
    expect(next.webview.posted[0]).toStrictEqual({ type: 'setText', text: 'ord' })
    expect(next.webview.posted).toHaveLength(nextPosted)
  })
})
