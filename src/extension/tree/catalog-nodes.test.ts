import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

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
import type { EngineSession } from '../../core/engine/engine.ts'

const CATALOG = {
  listDatabases: async () => Promise.resolve([{ name: 'shop' }]),
  listSchemas: async () => Promise.resolve([{ name: 'public' }]),
  listTables: async () =>
    Promise.resolve([{ name: 'orders' }, { name: 'order_items' }, { name: 'customers' }]),
  listViews: async () =>
    Promise.resolve([
      { name: 'totals', isMaterialized: true },
      { name: 'recent', isMaterialized: false },
    ]),
  listColumns: async () =>
    Promise.resolve([
      {
        name: 'id',
        dataType: 'bigint',
        isNullable: false,
        defaultValue: undefined,
        isPrimaryKey: true,
      },
      {
        name: 'note',
        dataType: 'text',
        isNullable: true,
        defaultValue: "'none'",
        isPrimaryKey: false,
      },
    ]),
  listIndexes: async () =>
    Promise.resolve([
      { name: 'orders_pkey', columns: ['id'], isUnique: true, isPrimary: true },
      { name: 'orders_number', columns: ['number'], isUnique: true, isPrimary: false },
      {
        name: 'orders_customer_created',
        columns: ['customer_id', 'created_at'],
        isUnique: false,
        isPrimary: false,
      },
    ]),
  listForeignKeys: async () =>
    Promise.resolve([
      {
        name: 'orders_customer',
        columns: ['customer_id'],
        referencedSchema: 'public',
        referencedTable: 'customers',
        referencedColumns: ['id'],
        onUpdate: 'NO ACTION',
        onDelete: 'CASCADE',
      },
    ]),
} satisfies Partial<EngineSession>

async function connected(session: Partial<EngineSession> = CATALOG): Promise<Explorer> {
  const harness = explorer([SHOP], { session })
  await harness.sessions.connect(SHOP)
  return harness
}

describe('the catalog nodes', () => {
  it('should browse from the databases down to the columns, indexes and foreign keys', async () => {
    const { sut } = await connected()

    expect(labelsOf(sut, await open(sut, 'Shop'))).toStrictEqual(['shop'])
    expect(labelsOf(sut, await open(sut, 'Shop', 'shop'))).toStrictEqual(['public'])
    expect(labelsOf(sut, await open(sut, 'Shop', 'shop', 'public'))).toStrictEqual([
      'Tables',
      'Views',
    ])
    expect(labelsOf(sut, await open(sut, 'Shop', 'shop', 'public', 'Tables'))).toStrictEqual([
      'orders',
      'order_items',
      'customers',
    ])
    expect(
      labelsOf(sut, await open(sut, 'Shop', 'shop', 'public', 'Tables', 'orders')),
    ).toStrictEqual(['Columns', 'Indexes', 'Foreign Keys'])
  })

  it('should go straight to the tables and views of an engine without schemas', async () => {
    const local = { ...newConnection('local', MYSQL), name: 'Local', user: 'root' }
    const { sut, sessions } = explorer([local], { session: CATALOG })
    await sessions.connect(local)

    expect(labelsOf(sut, await open(sut, 'Local', 'shop'))).toStrictEqual(['Tables', 'Views'])
  })

  it('should describe the columns of a table', async () => {
    const { sut } = await connected()

    const columns = await open(sut, 'Shop', 'shop', 'public', 'Tables', 'orders', 'Columns')

    expect(itemOf(sut, columns, 'id')).toMatchObject({
      description: 'bigint · primary key · not null',
      tooltip: 'id bigint\nNot null\nDefault: none',
      iconPath: new vscode.ThemeIcon('key'),
      contextValue: 'column',
      collapsibleState: vscode.TreeItemCollapsibleState.None,
    })
    expect(itemOf(sut, columns, 'note')).toMatchObject({
      description: 'text',
      tooltip: "note text\nNullable\nDefault: 'none'",
      iconPath: new vscode.ThemeIcon('symbol-field'),
    })
  })

  it('should describe the indexes and the foreign keys of a table', async () => {
    const { sut } = await connected()

    const indexes = await open(sut, 'Shop', 'shop', 'public', 'Tables', 'orders', 'Indexes')
    const [foreignKey] = await open(
      sut,
      'Shop',
      'shop',
      'public',
      'Tables',
      'orders',
      'Foreign Keys',
    )

    expect(indexes.map((node) => sut.getTreeItem(node).description)).toStrictEqual([
      'id · primary',
      'number · unique',
      'customer_id, created_at',
    ])
    expect(foreignKey === undefined ? undefined : sut.getTreeItem(foreignKey)).toMatchObject({
      label: 'orders_customer',
      description: 'customer_id → public.customers (id)',
      tooltip: 'customer_id → public.customers (id)\nOn update: NO ACTION\nOn delete: CASCADE',
      iconPath: new vscode.ThemeIcon('references'),
    })
  })

  it('should list the views and their columns', async () => {
    const { sut } = await connected()

    const views = await open(sut, 'Shop', 'shop', 'public', 'Views')

    expect(itemOf(sut, views, 'totals').description).toBe('materialized')
    expect(itemOf(sut, views, 'recent').description).toBe('')
    expect(
      labelsOf(sut, await open(sut, 'Shop', 'shop', 'public', 'Views', 'recent')),
    ).toStrictEqual(['id', 'note'])
  })

  it('should only show the tables and views that match the filter', async () => {
    const { sut } = await connected()

    sut.setFilter('  ORDER ')

    expect(sut.filter).toBe('ORDER')
    expect(labelsOf(sut, await open(sut, 'Shop', 'shop', 'public', 'Tables'))).toStrictEqual([
      'orders',
      'order_items',
    ])
    expect(labelsOf(sut, await open(sut, 'Shop', 'shop', 'public', 'Views'))).toStrictEqual([
      'No views match "ORDER"',
    ])
  })

  it.each([
    { path: ['shop'], text: 'No schemas' },
    { path: ['shop', 'public', 'Tables'], text: 'No tables' },
    { path: ['shop', 'public', 'Views'], text: 'No views' },
    { path: ['shop', 'public', 'Views', 'recent'], text: 'No columns' },
  ])('should say $text when there is nothing to list', async ({ path, text }) => {
    const { sut } = await connected({
      listDatabases: CATALOG.listDatabases,
      listSchemas: path.length > 1 ? CATALOG.listSchemas : async () => Promise.resolve([]),
      listViews: path.length > 3 ? CATALOG.listViews : async () => Promise.resolve([]),
    })

    expect(labelsOf(sut, await open(sut, 'Shop', ...path))).toStrictEqual([text])
  })

  it.each([
    { group: 'Indexes', text: 'No indexes' },
    { group: 'Foreign Keys', text: 'No foreign keys' },
  ])('should say $text when the table has none', async ({ group, text }) => {
    const { sut } = await connected({
      ...CATALOG,
      listIndexes: async () => Promise.resolve([]),
      listForeignKeys: async () => Promise.resolve([]),
    })

    expect(
      labelsOf(sut, await open(sut, 'Shop', 'shop', 'public', 'Tables', 'orders', group)),
    ).toStrictEqual([text])
  })

  it('should show why loading failed, log it, and try again next time', async () => {
    const listTables = vi
      .fn<EngineSession['listTables']>()
      .mockRejectedValueOnce(new Error('permission denied for schema public'))
      .mockResolvedValue([{ name: 'orders' }])
    const { sut, log } = await connected({ ...CATALOG, listTables })

    const failed = await open(sut, 'Shop', 'shop', 'public', 'Tables')

    expect(labelsOf(sut, failed)).toStrictEqual(['permission denied for schema public'])
    expect(failed[0] === undefined ? undefined : sut.getTreeItem(failed[0]).iconPath).toStrictEqual(
      new vscode.ThemeIcon('error'),
    )
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Could not load the children of .*: permission denied for schema public$/,
      ),
    )
    expect(labelsOf(sut, await open(sut, 'Shop', 'shop', 'public', 'Tables'))).toStrictEqual([
      'orders',
    ])
  })

  it('should keep loaded children until a refresh', async () => {
    const listDatabases = vi.fn<EngineSession['listDatabases']>(async () =>
      Promise.resolve([{ name: 'shop' }]),
    )
    const { sut } = await connected({ ...CATALOG, listDatabases })
    const fired = vi.fn()
    sut.onDidChangeTreeData(fired)

    const [root] = await childrenOf(sut)
    await childrenOf(sut, root)
    await childrenOf(sut, root)
    sut.refresh(root)
    await childrenOf(sut, root)
    sut.refresh()
    await childrenOf(sut, root)

    expect(listDatabases).toHaveBeenCalledTimes(3)
    expect(fired.mock.calls).toStrictEqual([[root], [undefined]])
  })

  it('should give the leaves no children', async () => {
    const { sut } = await connected()
    const [column] = await open(sut, 'Shop', 'shop', 'public', 'Tables', 'orders', 'Columns')

    await expect(childrenOf(sut, column)).resolves.toStrictEqual([])
  })

  it('should say a node is not connected once its connection closed', async () => {
    const { sut, sessions } = await connected()
    const [root] = await childrenOf(sut)
    const [database] = await childrenOf(sut, root)

    await sessions.disconnect('shop')

    expect(labelsOf(sut, await childrenOf(sut, database))).toStrictEqual(['Not connected'])
  })
})
