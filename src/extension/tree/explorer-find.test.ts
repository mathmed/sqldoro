import { describe, expect, it } from 'vitest'
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
import type { ExplorerNode } from './explorer-node.ts'
import { loadingText } from './loading-text.ts'

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

describe('finding a table in the explorer', () => {
  it('should open the connected connections down to the tables and views that match', async () => {
    const { sut, sessions } = explorer([SHOP], { session: catalog(['shop']) })
    await sessions.connect(SHOP)

    sut.setFind(' ord ')
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
    expect(roots[0]?.id).toContain('#find:ord')
  })

  it('should paint the branches found like those of the tree', async () => {
    const { sut, sessions } = explorer([SHOP], { session: catalog(['shop']) })
    await sessions.connect(SHOP)
    sut.setFind('ord')

    const [shop] = await childrenOf(sut)
    const [database] = await childrenOf(sut, shop)
    const [schema] = await childrenOf(sut, database)
    const groups = await childrenOf(sut, schema)
    const iconOf = (node: ExplorerNode | undefined): unknown =>
      node === undefined ? undefined : sut.getTreeItem(node).iconPath
    const icon = (id: string, color: string): vscode.ThemeIcon =>
      new vscode.ThemeIcon(id, new vscode.ThemeColor(color))

    expect(iconOf(database)).toStrictEqual(icon('database', 'charts.yellow'))
    expect(iconOf(schema)).toStrictEqual(icon('symbol-namespace', 'charts.purple'))
    expect(groups.map(iconOf)).toStrictEqual([
      icon('table', 'charts.blue'),
      icon('eye', 'charts.orange'),
    ])
  })

  it('should highlight the text in the names found', async () => {
    const { sut, sessions } = explorer([SHOP], { session: catalog(['shop']) })
    await sessions.connect(SHOP)
    sut.setFind('TOT')

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
  })

  it('should list a MySQL server by its databases, without its own', async () => {
    const { sut, sessions } = explorer([CRM], { session: catalog(['crm', 'mysql']) })
    await sessions.connect(CRM)
    sut.setFind('lines')

    expect(await walk(sut, await childrenOf(sut))).toStrictEqual([
      'CRM',
      '  crm',
      '    Tables',
      '      lines',
    ])
  })

  it('should look in the first databases of a PostgreSQL connection that names none', async () => {
    const many = Array.from({ length: 12 }, (...[, index]) => `db${String(index)}`)
    const { sut, sessions } = explorer([{ ...SHOP, database: '' }], { session: catalog(many) })
    await sessions.connect(SHOP)
    sut.setFind('lines')

    const [shop] = await childrenOf(sut)

    expect(labelsOf(sut, await childrenOf(sut, shop))).toHaveLength(10)
  })

  it('should say when nothing matches, leaving out connections that are not connected', async () => {
    const { sut } = explorer([SHOP], { session: catalog(['shop']) })
    sut.setFind('ord')

    expect(labelsOf(sut, await childrenOf(sut))).toStrictEqual(['No table or view matches "ord"'])
  })

  it('should say in the log why the tables of a connection could not be listed', async () => {
    const { sut, sessions, log } = explorer([SHOP], {
      session: { listSchemas: async () => Promise.reject(new Error('permission denied')) },
    })
    await sessions.connect(SHOP)
    sut.setFind('ord')

    expect(labelsOf(sut, await childrenOf(sut))).toStrictEqual(['No table or view matches "ord"'])
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not list the tables of "Shop": permission denied'),
    )
  })

  it('should give the tree back once the text is cleared', async () => {
    const { sut } = explorer([SHOP])
    sut.setFind('ord')
    sut.setFind('')

    expect(labelsOf(sut, await childrenOf(sut))).toStrictEqual(['Shop'])
  })
})

describe('loadingText', () => {
  it('should say what a list loads', () => {
    expect(loadingText('tables')).toBe('Loading tables…')
    expect(loadingText('schema')).toBe('Loading…')
  })
})
