import { describe, expect, it, vi } from 'vitest'

import {
  childrenOf,
  type Explorer,
  explorer,
  itemOf,
  labelsOf,
  MYSQL,
  open,
  SHOP,
} from '../../../test/support/explorer.ts'
import { newConnection } from '../../core/connection/connection.ts'
import { CatalogDetail } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { ExplorerNode } from './explorer-node.ts'
import type { Changed } from './explorer-provider.ts'

const TABLES = [
  { name: 'orders', stats: { estimatedRows: 27_412n, sizeBytes: 33_554_432n } },
  { name: 'order_items', stats: { estimatedRows: undefined, sizeBytes: 16_384n } },
  { name: 'customers', stats: { estimatedRows: undefined, sizeBytes: undefined } },
]
const DATABASES = [
  { name: 'shop', stats: { sizeBytes: 2_147_483_648n } },
  { name: 'secret', stats: { sizeBytes: undefined } },
]

// Answers with the statistics only when asked for them, like the drivers.
const CATALOG = {
  listDatabases: async (detail) =>
    Promise.resolve(
      detail === CatalogDetail.Statistics ? DATABASES : DATABASES.map(({ name }) => ({ name })),
    ),
  listSchemas: async () => Promise.resolve([{ name: 'public' }]),
  listTables: async (...[, detail]) =>
    Promise.resolve(
      detail === CatalogDetail.Statistics ? TABLES : TABLES.map(({ name }) => ({ name })),
    ),
  listViews: async () =>
    Promise.resolve([
      { name: 'totals', isMaterialized: true },
      { name: 'recent', isMaterialized: false },
    ]),
} satisfies Partial<EngineSession>

const DENIED = new Error('permission denied for database secret')

async function connected(session: Partial<EngineSession> = CATALOG): Promise<Explorer> {
  const harness = explorer([SHOP], { session })
  await harness.sessions.connect(SHOP)
  return harness
}

function find(sut: Explorer['sut'], nodes: readonly ExplorerNode[], label: string): ExplorerNode {
  const node = nodes.find((candidate) => labelsOf(sut, [candidate])[0] === label)
  if (node === undefined) {
    throw new Error(`no "${label}"`)
  }
  return node
}

describe('the statistics in the explorer', () => {
  it('should show the server version beside a connected connection', async () => {
    const { sut } = await connected()

    expect(itemOf(sut, await childrenOf(sut), 'Shop').description).toBe('PROD · 🔒 · 18.6')
  })

  it('should show the size of each database, exact in its tooltip', async () => {
    const { sut } = await connected()

    const databases = await open(sut, 'Shop')

    expect(itemOf(sut, databases, 'shop')).toMatchObject({
      description: '2 GB',
      tooltip: 'shop\nSize: 2 GB (2,147,483,648 bytes)',
    })
    expect(itemOf(sut, databases, 'secret')).toMatchObject({ description: '', tooltip: 'secret' })
  })

  it('should show the estimated rows and the size of each table, exact in its tooltip', async () => {
    const { sut } = await connected()

    const tables = await open(sut, 'Shop', 'shop', 'public', 'Tables')

    expect(itemOf(sut, tables, 'orders')).toMatchObject({
      description: '~27k rows · 32 MB',
      tooltip: [
        'orders',
        'Rows: ~27,412',
        'Size: 32 MB (33,554,432 bytes)',
        'Estimates from the catalog statistics',
      ].join('\n'),
    })
    expect(itemOf(sut, tables, 'order_items').description).toBe('16 KB')
    expect(itemOf(sut, tables, 'customers')).toMatchObject({
      description: '',
      tooltip: 'customers',
    })
  })

  it('should show nothing new beside the views', async () => {
    const { sut } = await connected()

    const views = await open(sut, 'Shop', 'shop', 'public', 'Views')

    expect(itemOf(sut, views, 'totals')).toMatchObject({
      description: 'materialized',
      tooltip: 'totals',
    })
    expect(itemOf(sut, views, 'recent').description).toBe('')
  })

  it('should count the tables and the views of a group once they load, and redraw it', async () => {
    const { sut } = await connected()
    const fired: Changed[] = []
    sut.onDidChangeTreeData((node) => fired.push(node))
    const groups = await open(sut, 'Shop', 'shop', 'public')
    const [tables, views] = groups

    expect(groups.map((group) => sut.getTreeItem(group).description)).toStrictEqual(['', ''])
    await childrenOf(sut, tables)
    await childrenOf(sut, views)
    await childrenOf(sut, tables)

    expect(groups.map((group) => sut.getTreeItem(group).description)).toStrictEqual(['3', '2'])
    expect(fired).toStrictEqual([tables, views])
  })

  it('should say how many objects of a group the filter shows', async () => {
    const { sut } = await connected()
    sut.setFilter('order')
    const groups = await open(sut, 'Shop', 'shop', 'public')

    await Promise.all(groups.map(async (group) => childrenOf(sut, group)))

    expect(groups.map((group) => sut.getTreeItem(group).description)).toStrictEqual([
      '2 of 3',
      '0 of 2',
    ])
  })

  it('should list the tables without statistics when the server cannot give them', async () => {
    const listTables = vi.fn<EngineSession['listTables']>(async (scope, detail) =>
      detail === CatalogDetail.Statistics
        ? Promise.reject(DENIED)
        : CATALOG.listTables(scope, detail),
    )
    const { sut, log } = await connected({ ...CATALOG, listTables })

    const tables = await open(sut, 'Shop', 'shop', 'public', 'Tables')

    expect(labelsOf(sut, tables)).toStrictEqual(['orders', 'order_items', 'customers'])
    expect(itemOf(sut, tables, 'orders')).toMatchObject({ description: '', tooltip: 'orders' })
    expect(listTables.mock.calls.map(([, detail]) => detail)).toStrictEqual([
      CatalogDetail.Statistics,
      CatalogDetail.Names,
    ])
    expect(log.debug).toHaveBeenCalledExactlyOnceWith(
      'Could not read the statistics of ["tables","shop","shop","public"]: permission denied for database secret',
    )
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('should list the databases without their sizes when the server cannot give them', async () => {
    const listDatabases = vi.fn<EngineSession['listDatabases']>(async (detail) =>
      detail === CatalogDetail.Statistics ? Promise.reject(DENIED) : CATALOG.listDatabases(detail),
    )
    const { sut, log } = await connected({ ...CATALOG, listDatabases })

    const databases = await open(sut, 'Shop')

    expect(databases.map((node) => sut.getTreeItem(node).description)).toStrictEqual(['', ''])
    expect(log.debug).toHaveBeenCalledExactlyOnceWith(
      'Could not read the statistics of ["connection","shop"]: permission denied for database secret',
    )
  })

  it('should read the list a table or a database comes from again when it is refreshed', async () => {
    const { sut } = await connected()
    const [root] = await childrenOf(sut)
    const databases = await childrenOf(sut, root)
    const groups = await open(sut, 'Shop', 'shop', 'public')
    const tables = await childrenOf(sut, groups[0])
    const fired: Changed[] = []
    sut.onDidChangeTreeData((node) => fired.push(node))

    sut.refresh(find(sut, tables, 'orders'))
    sut.refresh(find(sut, databases, 'shop'))
    sut.refresh(groups[0])

    expect(fired).toStrictEqual([groups[0], root, groups[0]])
  })

  it('should go straight to the tables of an engine without schemas, with their statistics', async () => {
    const local = { ...newConnection('local', MYSQL), name: 'Local', user: 'root' }
    const { sut, sessions } = explorer([local], { session: CATALOG })
    await sessions.connect(local)

    const tables = await open(sut, 'Local', 'shop', 'Tables')

    expect(itemOf(sut, tables, 'orders').description).toBe('~27k rows · 32 MB')
    expect(itemOf(sut, await childrenOf(sut), 'Local').description).toBe('🔒 · 18.6')
  })
})
