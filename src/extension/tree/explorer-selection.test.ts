import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
  type Explorer,
  explorer,
  itemOf,
  labelsOf,
  MYSQL,
  open,
  SHOP,
} from '../../../test/support/explorer.ts'
import { newConnection } from '../../core/connection/connection.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { ExplorerNode } from './explorer-node.ts'
import type { Changed } from './explorer-provider.ts'
import { databaseUri, schemaUri } from './node-uris.ts'

const EDITOR_NOTE = 'The SQL editor in front runs here'
const DEFAULT_NOTE = 'New queries on this connection run here'
const MARKED_DATABASE = new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'))
const DATABASE = new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.yellow'))

function catalog(): Partial<EngineSession> {
  return {
    listDatabases: vi.fn(async () => Promise.resolve([{ name: 'shop' }, { name: 'stock' }])),
    listSchemas: async () => Promise.resolve([{ name: 'public' }, { name: 'sales' }]),
  }
}

async function connected(session = catalog()): Promise<Explorer> {
  const harness = explorer([SHOP], { session })
  await harness.sessions.connect(SHOP)
  return harness
}

function byLabel(
  nodes: readonly ExplorerNode[],
  sut: Explorer['sut'],
  label: string,
): ExplorerNode {
  const node = nodes.find((candidate) => sut.getTreeItem(candidate).label === label)
  if (node === undefined) {
    throw new Error(`no "${label}"`)
  }
  return node
}

describe('the database the SQL editor in front runs on', () => {
  it('should mark its database and schema with the accent and say so in their tooltips', async () => {
    const { sut, selection } = await connected()
    selection.follow({ connectionId: 'shop', database: 'shop', schema: 'sales' })

    const databases = await open(sut, 'Shop')
    const schemas = await open(sut, 'Shop', 'shop')

    expect(itemOf(sut, databases, 'shop')).toMatchObject({
      iconPath: MARKED_DATABASE,
      tooltip: `shop\n${EDITOR_NOTE}`,
      resourceUri: databaseUri('shop', 'shop'),
    })
    expect(itemOf(sut, databases, 'stock')).toMatchObject({
      iconPath: DATABASE,
      tooltip: 'stock',
      resourceUri: databaseUri('shop', 'stock'),
    })
    expect(itemOf(sut, schemas, 'sales')).toMatchObject({
      iconPath: new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('charts.green')),
      tooltip: `sales\n${EDITOR_NOTE}`,
      resourceUri: schemaUri('shop', 'shop', 'sales'),
    })
    expect(itemOf(sut, schemas, 'public')).toMatchObject({
      iconPath: new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('charts.purple')),
      tooltip: 'public',
    })
  })

  it('should mark the default database of each connection when no SQL editor is in front', async () => {
    const { sut, selection } = await connected()
    selection.follow(undefined)

    const databases = await open(sut, 'Shop')

    expect(itemOf(sut, databases, 'shop')).toMatchObject({
      iconPath: MARKED_DATABASE,
      tooltip: `shop\n${DEFAULT_NOTE}`,
    })
    expect(itemOf(sut, await open(sut, 'Shop', 'shop'), 'public').tooltip).toBe(
      `public\n${DEFAULT_NOTE}`,
    )
  })

  it('should mark a MySQL database, where the database is the schema', async () => {
    const local = { ...newConnection('local', MYSQL), name: 'Local', user: 'root' }
    const { sut, sessions, selection } = explorer([local], { session: catalog() })
    await sessions.connect(local)
    selection.follow({ connectionId: 'local', database: 'stock', schema: '' })

    const databases = await open(sut, 'Local')

    expect(itemOf(sut, databases, 'stock').iconPath).toStrictEqual(MARKED_DATABASE)
    expect(itemOf(sut, databases, 'shop').iconPath).toStrictEqual(DATABASE)
  })

  it('should draw again only the nodes whose mark changed, without reading their lists again', async () => {
    const session = catalog()
    const { sut, selection } = await connected(session)
    selection.follow({ connectionId: 'shop', database: 'shop', schema: '' })
    const databases = await open(sut, 'Shop')
    const schemas = await open(sut, 'Shop', 'shop')
    labelsOf(sut, [...databases, ...schemas])
    const fired: Changed[] = []
    const refreshes = vi.fn()
    sut.onDidChangeTreeData((node) => fired.push(node))
    sut.onDidRefresh(refreshes)

    selection.follow({ connectionId: 'shop', database: 'stock', schema: '' })

    expect(fired).toStrictEqual([
      byLabel(databases, sut, 'shop'),
      byLabel(databases, sut, 'stock'),
      byLabel(schemas, sut, 'public'),
    ])
    expect(refreshes).not.toHaveBeenCalled()
    await open(sut, 'Shop')
    expect(session.listDatabases).toHaveBeenCalledOnce()
  })

  it('should forget the nodes it drew on a refresh of the whole view', async () => {
    const { sut, selection } = await connected()
    selection.follow(undefined)
    await open(sut, 'Shop')
    const fired: Changed[] = []
    const refreshes = vi.fn()
    sut.onDidChangeTreeData((node) => fired.push(node))
    sut.onDidRefresh(refreshes)

    sut.refresh()
    selection.follow({ connectionId: 'shop', database: 'stock', schema: '' })

    expect(fired).toStrictEqual([undefined])
    expect(refreshes).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it('should stop following the mark once disposed', async () => {
    const { sut, selection } = await connected()
    await open(sut, 'Shop')
    const listener = vi.fn()
    sut.onDidChangeTreeData(listener)

    sut.dispose()
    selection.follow(undefined)

    expect(listener).not.toHaveBeenCalled()
  })

  it('should leave the nodes of other connections alone', async () => {
    const other = { ...SHOP, id: 'other', name: 'Other', database: '' }
    const { sut, sessions, selection } = explorer([SHOP, other], { session: catalog() })
    await sessions.connect(SHOP)
    await sessions.connect(other)
    const shop = await open(sut, 'Shop')
    labelsOf(sut, [...shop, ...(await open(sut, 'Other'))])
    const fired: Changed[] = []
    sut.onDidChangeTreeData((node) => fired.push(node))

    selection.follow(undefined)

    expect(fired).toStrictEqual([byLabel(shop, sut, 'shop')])
  })
})
