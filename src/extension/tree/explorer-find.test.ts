import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
  childrenOf,
  explorer,
  itemOf,
  labelsOf,
  MYSQL,
  SHOP,
} from '../../../test/support/explorer.ts'
import { EnvironmentTag, newConnection } from '../../core/connection/connection.ts'
import { CommandId } from '../command-id.ts'
import type { ExplorerNode } from './explorer-node.ts'
import { loadingText } from './loading-text.ts'
import { databaseUri, schemaUri } from './node-uris.ts'

const CRM = {
  ...newConnection('crm', MYSQL),
  name: 'CRM',
  environment: EnvironmentTag.None,
}
const SCHEMAS = [{ name: 'sales' }, { name: 'pg_catalog' }]

function catalog(databases: readonly string[]): object {
  return {
    listDatabases: async () => Promise.resolve(databases.map((name) => ({ name }))),
    listSchemas: async () => Promise.resolve(SCHEMAS),
    listTables: async () => Promise.resolve([{ name: 'orders' }, { name: 'lines' }]),
    listViews: async () => Promise.resolve([{ name: 'order_totals', isMaterialized: false }]),
  }
}

function labelOf(item: vscode.TreeItem): string {
  return typeof item.label === 'string' ? item.label : (item.label?.label ?? '')
}

// The tree as VS Code shows it: the nodes it opens by themselves, opened, each level indented.
async function walk(
  sut: Parameters<typeof labelsOf>[0],
  nodes: readonly ExplorerNode[],
): Promise<string[]> {
  const lines: string[] = []
  for (const node of nodes) {
    const item = sut.getTreeItem(node)
    lines.push(labelOf(item))
    if (item.collapsibleState === vscode.TreeItemCollapsibleState.Expanded) {
      lines.push(...(await walk(sut, await childrenOf(sut, node))).map((line) => `  ${line}`))
    }
  }
  return lines
}

// The explorer of these connections, connected, its tables loaded, finding the text.
async function finding(
  text: string,
  ...[connections, options]: Parameters<typeof explorer>
): Promise<ReturnType<typeof explorer>> {
  const found = explorer(connections, options)
  for (const connection of connections) {
    await found.sessions.connect(connection)
  }
  found.sut.setFind(text)
  await found.index.load()
  return found
}

describe('finding a table in the explorer', () => {
  it('should open the connected connections down to the tables and views that match', async () => {
    const { sut } = await finding(' ord ', [SHOP], { session: catalog(['shop']) })
    const roots = await childrenOf(sut)

    expect(sut.find).toBe('ord')
    expect(await walk(sut, roots)).toStrictEqual([
      'Shop',
      '  shop',
      '    sales',
      '      Tables',
      '        orders',
      '      Views',
      '        order_totals',
    ])
    expect(roots.map(({ id }) => id)).toStrictEqual(['["connection","shop"]#find'])
  })

  it('should paint what is found like the tree, the database in front marked', async () => {
    const { sut, selection } = await finding('ord', [SHOP], { session: catalog(['shop']) })
    selection.follow({ connectionId: 'shop', database: 'shop', schema: 'sales' })

    const [shop] = await childrenOf(sut)
    const [database] = await childrenOf(sut, shop)
    const [schema] = await childrenOf(sut, database)
    const groups = await childrenOf(sut, schema)
    const [tables, views] = groups
    const itemOfNode = (node: ExplorerNode | undefined): vscode.TreeItem | undefined =>
      node === undefined ? undefined : sut.getTreeItem(node)
    const icon = (id: string, color: string): vscode.ThemeIcon =>
      new vscode.ThemeIcon(id, new vscode.ThemeColor(color))

    expect(itemOfNode(database)).toMatchObject({
      iconPath: icon('database', 'charts.green'),
      tooltip: 'shop\nThe SQL editor in front runs here',
      resourceUri: databaseUri('shop', 'shop'),
    })
    expect(itemOfNode(schema)).toMatchObject({
      iconPath: icon('symbol-namespace', 'charts.green'),
      tooltip: 'sales\nThe SQL editor in front runs here',
      resourceUri: schemaUri('shop', 'shop', 'sales'),
    })
    expect(groups.map((node) => itemOfNode(node)?.iconPath)).toStrictEqual([
      icon('table', 'charts.blue'),
      icon('eye', 'charts.orange'),
    ])
    expect(itemOfNode((await childrenOf(sut, tables))[0])?.iconPath).toStrictEqual(
      icon('table', 'charts.blue'),
    )
    expect(itemOfNode((await childrenOf(sut, views))[0])?.iconPath).toStrictEqual(
      icon('eye', 'charts.orange'),
    )
    selection.follow({ connectionId: 'shop', database: 'other', schema: '' })
    expect(itemOfNode(database)?.iconPath).toStrictEqual(icon('database', 'charts.red'))
  })

  it('should highlight the text in the names found, and count the matches of a group', async () => {
    const { sut } = await finding('TOT', [SHOP], { session: catalog(['shop']) })

    const [shop] = await childrenOf(sut)
    const [database] = await childrenOf(sut, shop)
    const [schema] = await childrenOf(sut, database)
    const groups = await childrenOf(sut, schema)
    const [views] = groups

    expect(itemOf(sut, groups, 'Views').description).toBe('1')
    expect(itemOf(sut, await childrenOf(sut, views), 'order_totals').label).toStrictEqual({
      label: 'order_totals',
      highlights: [[6, 9]],
    })
    expect(database?.place).toStrictEqual({ database: 'shop', schema: '', name: '' })
    expect(schema?.place).toStrictEqual({ database: 'shop', schema: 'sales', name: '' })
  })

  it('should open the rows of a table found, and its columns like in the explorer', async () => {
    const { sut } = await finding('lines', [SHOP], {
      session: { ...catalog(['shop']), listColumns: async () => Promise.resolve([]) },
    })
    const lines = sut.bestMatch()
    if (lines === undefined) {
      throw new Error('nothing found')
    }

    const item = sut.getTreeItem(lines)

    expect(item.command).toMatchObject({
      command: CommandId.OpenTableData,
      arguments: [{ kind: 'table', place: { database: 'shop', schema: 'sales', name: 'lines' } }],
    })
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed)
    expect(labelsOf(sut, await childrenOf(sut, lines))).toStrictEqual([
      'Columns',
      'Indexes',
      'Foreign Keys',
    ])
  })

  it('should list a MySQL server by its databases, without its own', async () => {
    const { sut } = await finding('lines', [CRM], { session: catalog(['crm', 'mysql']) })

    expect(await walk(sut, await childrenOf(sut))).toStrictEqual([
      'CRM',
      '  crm',
      '    Tables',
      '      lines',
    ])
  })

  it('should look in the first databases of a PostgreSQL connection that names none', async () => {
    const many = Array.from({ length: 12 }, (...[, index]) => `db${String(index)}`)
    const { sut } = await finding('lines', [{ ...SHOP, database: '' }], { session: catalog(many) })

    const [shop] = await childrenOf(sut)

    expect(labelsOf(sut, await childrenOf(sut, shop))).toStrictEqual(many.slice(0, 10))
  })

  it('should say when nothing matches, and that only connected connections are searched', async () => {
    const connected = await finding('nothing', [SHOP], { session: catalog(['shop']) })
    const { sut } = explorer([SHOP], { session: catalog(['shop']) })
    sut.setFind('ord')

    expect(labelsOf(connected.sut, await childrenOf(connected.sut))).toStrictEqual([
      'No table or view matches',
    ])
    expect(connected.sut.bestMatch()).toBeUndefined()
    expect(labelsOf(sut, await childrenOf(sut))).toStrictEqual([
      'Connect to a connection to find its tables',
    ])
  })

  it('should say in the log why the tables of a connection could not be listed', async () => {
    const { sut, log } = await finding('ord', [SHOP], {
      session: { listSchemas: async () => Promise.reject(new Error('permission denied')) },
    })

    expect(labelsOf(sut, await childrenOf(sut))).toStrictEqual(['No table or view matches'])
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not list the tables of "Shop": permission denied'),
    )
  })

  it('should give the tree back once the text is cleared', async () => {
    const { sut } = await finding('ord', [SHOP], { session: catalog(['shop']) })
    sut.setFind('  ')

    expect(labelsOf(sut, await childrenOf(sut))).toStrictEqual(['Shop'])
    expect(sut.bestMatch()).toBeUndefined()
  })

  it('should say where the search stands each time it changes', async () => {
    const { sut, sessions, index } = explorer([SHOP], { session: catalog(['shop']) })
    const statuses = vi.fn()
    sut.onDidChangeFind(statuses)
    await sessions.connect(SHOP)

    sut.setFind('ord ')
    await index.load()

    expect(statuses).toHaveBeenCalledWith({
      text: 'ord ',
      matchCount: 0,
      connectionCount: 1,
      isLoading: true,
    })
    expect(sut.findStatus).toStrictEqual({
      text: 'ord ',
      matchCount: 2,
      connectionCount: 1,
      isLoading: false,
    })
  })
})

describe('loadingText', () => {
  it('should say what a list loads', () => {
    expect(loadingText('tables')).toBe('Loading tables…')
    expect(loadingText('schema')).toBe('Loading…')
  })
})
