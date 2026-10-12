import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
  childrenOf,
  explorer,
  labelsOf,
  manualClock,
  SHOP,
} from '../../../test/support/explorer.ts'
import type { TableInfo } from '../../core/engine/catalog.ts'
import type { ExplorerNode } from './explorer-node.ts'
import type { Changed, ExplorerProvider } from './explorer-provider.ts'

const SCHEMAS = [{ name: 'sales' }, { name: 'audit' }]
const TABLES = new Map([
  ['sales', [{ name: 'orders' }, { name: 'order_lines' }, { name: 'lines' }]],
  ['audit', [{ name: 'order_events' }]],
])

const CATALOG = {
  listDatabases: async () => Promise.resolve([{ name: 'shop' }]),
  listSchemas: async () => Promise.resolve(SCHEMAS),
  listTables: async ({ schema }: { readonly schema: string }) =>
    Promise.resolve(TABLES.get(schema) ?? []),
  listViews: async () => Promise.resolve([]),
}

// Every node VS Code would show, opened as the tree says, by id.
async function shown(
  sut: ExplorerProvider,
  nodes?: readonly ExplorerNode[],
): Promise<ExplorerNode[]> {
  const level = nodes ?? (await childrenOf(sut))
  const all: ExplorerNode[] = []
  for (const node of level) {
    all.push(node)
    if (sut.getTreeItem(node).collapsibleState === vscode.TreeItemCollapsibleState.Expanded) {
      all.push(...(await shown(sut, await childrenOf(sut, node))))
    }
  }
  return all
}

// An explorer on a connected Shop whose tables are loaded, its tree changes recorded.
async function loaded(): Promise<
  ReturnType<typeof explorer> & {
    readonly clock: ReturnType<typeof manualClock>
    readonly fired: Changed[]
  }
> {
  const clock = manualClock()
  const found = explorer([SHOP], { session: CATALOG, delay: clock.delay })
  await found.sessions.connect(SHOP)
  found.sut.prepareFind()
  await found.index.load()
  const fired: Changed[] = []
  found.sut.onDidChangeTreeData((change) => fired.push(change))
  return { ...found, clock, fired }
}

// The node a test needs: it fails when the tree does not have it.
function present(node: ExplorerNode | undefined): ExplorerNode {
  if (node === undefined) {
    throw new Error('the tree does not have the node')
  }
  return node
}

function idsOf(change: Changed): string[] {
  return Array.isArray(change) ? change.map(({ id }) => id) : []
}

describe('finding a table as it is typed', () => {
  it('should keep the same nodes under the same ids whatever the text', async () => {
    const { sut } = await loaded()

    sut.setFind('ord')
    const before = await shown(sut)
    sut.setFind('order')
    const after = await shown(sut)

    expect(after.map(({ id }) => id)).toStrictEqual(before.map(({ id }) => id))
    expect(after.filter((node) => before.includes(node))).toHaveLength(before.length)
    expect(after.map(({ id }) => id).filter((id) => !id.endsWith(']#find'))).toStrictEqual([])
  })

  it('should tell VS Code only what changed while typing, never the whole tree', async () => {
    const { sut, clock, fired } = await loaded()

    sut.setFind('o')
    for (const text of ['or', 'ord', 'orde', 'order']) {
      sut.setFind(text)
      await clock.elapse()
    }

    expect(fired[0]).toBeUndefined()
    expect(fired.slice(1)).not.toContain(undefined)
    expect(fired.slice(1).map(idsOf)).toContainEqual([
      '["tables","shop","shop","sales"]#find',
      '["tables","shop","shop","audit"]#find',
    ])
  })

  it('should tell VS Code at most once in a while, with what changed meanwhile', async () => {
    const { sut, clock, fired } = await loaded()

    sut.setFind('ord')
    sut.setFind('order')
    sut.setFind('order_')
    expect(fired).toStrictEqual([undefined])

    await clock.elapse()
    expect(fired.map(idsOf)).toStrictEqual([
      [],
      ['["tables","shop","shop","sales"]#find', '["tables","shop","shop","audit"]#find'],
    ])
    await clock.elapse()
    await clock.elapse()
    expect(fired).toHaveLength(2)
    expect(clock.waiting()).toBe(0)
  })

  it('should draw the parent of a branch that went while the tree waited', async () => {
    const { sut, clock, fired } = await loaded()

    sut.setFind('ord')
    sut.setFind('order')
    sut.setFind('order_l')
    await clock.elapse()

    expect(fired.map(idsOf)).toStrictEqual([
      [],
      ['["tables","shop","shop","sales"]#find', '["database","shop","shop"]#find'],
    ])
  })

  it('should draw the whole tree again when it starts, stops, or its connections change', async () => {
    const { sut, clock, fired } = await loaded()

    sut.setFind('ord')
    sut.setFind('nothing')
    await clock.elapse()
    sut.setFind('')
    await clock.elapse()

    expect(fired).toStrictEqual([undefined, undefined, undefined])
  })

  it('should open what is found the first time, and keep what the user closed', async () => {
    const { sut } = await loaded()
    sut.setFind('ord')
    const [shop] = await childrenOf(sut)
    const [database] = await childrenOf(sut, shop)
    if (database === undefined) {
      throw new Error('nothing found')
    }

    sut.remember(database, false)
    sut.setFind('order')

    expect(sut.getTreeItem(database).collapsibleState).toBe(
      vscode.TreeItemCollapsibleState.Collapsed,
    )
    expect(sut.getTreeItem(present(shop)).collapsibleState).toBe(
      vscode.TreeItemCollapsibleState.Expanded,
    )
  })

  it('should give the tree back as the user left it', async () => {
    const { sut } = await loaded()
    const [shop] = await childrenOf(sut)
    if (shop === undefined) {
      throw new Error('no connection')
    }
    const [database] = await childrenOf(sut, shop)
    sut.remember(shop, true)

    sut.setFind('ord')
    await shown(sut)
    sut.setFind('')
    const [again] = await childrenOf(sut)

    expect(again?.id).toBe(shop.id)
    expect(sut.getTreeItem(present(again)).collapsibleState).toBe(
      vscode.TreeItemCollapsibleState.Expanded,
    )
    expect(sut.getTreeItem(present(database)).collapsibleState).toBe(
      vscode.TreeItemCollapsibleState.Collapsed,
    )
  })

  it('should know the parents of what it found, to reveal the best match', async () => {
    const { sut } = await loaded()
    sut.setFind('lines')
    const first = sut.bestMatch()

    const chain: string[] = []
    for (let node = first; node !== undefined; node = sut.getParent(node)) {
      chain.unshift(sut.getTreeItem(node).label as string)
    }

    expect(chain.slice(0, -1)).toStrictEqual(['Shop', 'shop', 'sales', 'Tables'])
    expect(sut.getParent(present((await childrenOf(sut))[0]))).toBeUndefined()
  })

  it('should keep answering for a node VS Code still holds after the text left it', async () => {
    const { sut } = await loaded()
    sut.setFind('order_events')
    const [shop] = await childrenOf(sut)
    const [database] = await childrenOf(sut, shop)
    const [audit] = await childrenOf(sut, database)
    const events = present(sut.bestMatch())

    sut.setFind('lines')

    expect(await childrenOf(sut, audit)).toStrictEqual([])
    expect(sut.getTreeItem(events).label).toStrictEqual({
      label: 'order_events',
      highlights: [[0, 12]],
    })
  })
})

describe('the catalog behind a find', () => {
  it('should never read it again while typing or when the database in front changes', async () => {
    const listSchemas = vi.fn(CATALOG.listSchemas)
    const clock = manualClock()
    const { sut, sessions, index, selection } = explorer([SHOP], {
      session: { ...CATALOG, listSchemas },
      delay: clock.delay,
    })
    await sessions.connect(SHOP)
    const refreshes = vi.fn()
    sut.onDidRefresh(refreshes)
    sut.setFind('o')
    await index.load()
    await clock.elapse()
    await shown(sut)
    const fired: Changed[] = []
    sut.onDidChangeTreeData((change) => fired.push(change))

    sut.setFind('ord')
    await clock.elapse()
    selection.follow({ connectionId: 'shop', database: 'shop', schema: 'sales' })
    selection.follow({ connectionId: 'shop', database: 'shop', schema: 'audit' })

    expect(refreshes).not.toHaveBeenCalled()
    expect(listSchemas).toHaveBeenCalledOnce()
    expect(fired).not.toContain(undefined)
    const nodes = fired.flatMap((change) =>
      Array.isArray(change) || change === undefined ? [] : [change.id],
    )
    expect(nodes).toContain('["schema","shop","shop","sales"]#find')
  })
})

describe('the tables of a find, as they load', () => {
  it('should show each namespace as soon as it loads, and say that more is coming', async () => {
    const audit = Promise.withResolvers<TableInfo[]>()
    const { sut, sessions, index } = explorer([SHOP], {
      session: {
        ...CATALOG,
        listTables: async ({ schema }) =>
          schema === 'audit' ? audit.promise : Promise.resolve(TABLES.get(schema) ?? []),
      },
    })
    await sessions.connect(SHOP)

    sut.setFind('ord')
    expect(labelsOf(sut, await childrenOf(sut))).toStrictEqual(['Loading tables…'])
    await vi.waitFor(async () => {
      expect(labelsOf(sut, await shown(sut))).toContain('orders')
    })
    expect(sut.findStatus).toMatchObject({ matchCount: 2, isLoading: true })

    audit.resolve([{ name: 'order_events' }])
    await index.load()

    expect(labelsOf(sut, await shown(sut))).toContain('order_events')
    expect(sut.findStatus).toMatchObject({ matchCount: 3, isLoading: false })
  })

  it('should find in a connection as soon as it connects, and leave one that disconnects', async () => {
    const { sut, sessions, index } = explorer([SHOP], { session: CATALOG })
    sut.setFind('ord')

    await sessions.connect(SHOP)
    await index.load()
    expect(sut.findStatus.matchCount).toBe(3)

    await sessions.disconnect(SHOP.id)
    expect(sut.findStatus).toMatchObject({ matchCount: 0, connectionCount: 0 })
  })

  it('should read the tables again, and make the connections again, on a refresh', async () => {
    const listSchemas = vi.fn(CATALOG.listSchemas)
    const { sut, sessions, index } = explorer([SHOP], { session: { ...CATALOG, listSchemas } })
    await sessions.connect(SHOP)
    sut.setFind('ord')
    await index.load()
    const [before] = await childrenOf(sut)

    sut.refresh()
    await index.load()
    const [after] = await childrenOf(sut)

    expect(listSchemas).toHaveBeenCalledTimes(2)
    expect(after?.id).toBe(before?.id)
    expect(after).not.toBe(before)
  })
})
