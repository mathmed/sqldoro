import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import {
  childrenOf,
  explorer,
  itemOf,
  MYSQL,
  open,
  POSTGRES,
} from '../../../test/support/explorer.ts'
import {
  ConnectionColor,
  type ConnectionConfig,
  EnvironmentTag,
  newConnection,
} from '../../core/connection/connection.ts'
import type { EngineSession } from '../../core/engine/engine.ts'

const WAREHOUSE: ConnectionConfig = {
  ...newConnection('warehouse', POSTGRES),
  name: 'Warehouse',
  database: 'stock',
  environment: EnvironmentTag.Staging,
  color: ConnectionColor.Purple,
}
const CRM: ConnectionConfig = { ...newConnection('crm', MYSQL), name: 'CRM' }

function catalog(): Partial<EngineSession> {
  return {
    listDatabases: async () => Promise.resolve([{ name: 'stock' }]),
    listSchemas: async () => Promise.resolve([{ name: 'public' }]),
    listTables: async () => Promise.resolve([{ name: 'items' }]),
  }
}

function icon(id: string, color: string): vscode.ThemeIcon {
  return new vscode.ThemeIcon(id, new vscode.ThemeColor(color))
}

async function connected(
  connections: readonly ConnectionConfig[],
): Promise<ReturnType<typeof explorer>> {
  const harness = explorer(connections, { session: catalog() })
  for (const connection of connections) {
    await harness.sessions.connect(connection)
  }
  return harness
}

interface Looks {
  readonly database: unknown
  readonly schema: unknown
  readonly tables: unknown
}

// The icons of the database, the schema and the tables group of the warehouse, as now drawn.
async function warehouseLooks(sut: ReturnType<typeof explorer>['sut']): Promise<Looks> {
  return {
    database: itemOf(sut, await open(sut, 'Warehouse'), 'stock').iconPath,
    schema: itemOf(sut, await open(sut, 'Warehouse', 'stock'), 'public').iconPath,
    tables: itemOf(sut, await open(sut, 'Warehouse', 'stock', 'public'), 'Tables').iconPath,
  }
}

describe('the databases and schemas in the color of their connection', () => {
  it('should paint them in the color the user gave the connection, and nothing else', async () => {
    const { sut } = await connected([WAREHOUSE])

    expect(await warehouseLooks(sut)).toStrictEqual({
      database: icon('database', 'charts.purple'),
      schema: icon('symbol-namespace', 'charts.purple'),
      tables: icon('table', 'charts.blue'),
    })
  })

  it('should paint them in the color of the environment when the connection has none', async () => {
    const { sut } = await connected([{ ...WAREHOUSE, color: ConnectionColor.None }])

    expect(await warehouseLooks(sut)).toMatchObject({
      database: icon('database', 'charts.orange'),
      schema: icon('symbol-namespace', 'charts.orange'),
    })
  })

  it('should paint them in red on production, whatever the color of the connection', async () => {
    const { sut } = await connected([{ ...WAREHOUSE, environment: EnvironmentTag.Production }])

    expect(await warehouseLooks(sut)).toMatchObject({
      database: icon('database', 'charts.red'),
      schema: icon('symbol-namespace', 'charts.red'),
    })
  })

  it('should keep their own colors for a connection without color or environment', async () => {
    const { sut } = await connected([CRM])

    expect(itemOf(sut, await open(sut, 'CRM'), 'stock').iconPath).toStrictEqual(
      icon('database', 'charts.yellow'),
    )
  })

  it('should keep the accent on the database and schema the SQL editor in front runs on', async () => {
    const { sut, selection } = await connected([WAREHOUSE])
    selection.follow({ connectionId: 'warehouse', database: 'stock', schema: 'public' })

    expect(await warehouseLooks(sut)).toMatchObject({
      database: icon('database', 'charts.green'),
      schema: icon('symbol-namespace', 'charts.green'),
    })
  })

  it('should show the new color once the connection is edited and the view drawn again', async () => {
    const connections = [WAREHOUSE]
    const { sut } = await connected(connections)
    const [database] = await open(sut, 'Warehouse')
    if (database === undefined) {
      throw new Error('no database')
    }

    connections[0] = { ...WAREHOUSE, color: ConnectionColor.Green }
    sut.refresh()

    expect(sut.getTreeItem(database).iconPath).toStrictEqual(icon('database', 'charts.green'))
    expect(await warehouseLooks(sut)).toMatchObject({
      database: icon('database', 'charts.green'),
      schema: icon('symbol-namespace', 'charts.green'),
    })
  })

  it('should give a node of a connection deleted meanwhile its own color', async () => {
    const connections = [WAREHOUSE]
    const { sut } = await connected(connections)
    const [database] = await open(sut, 'Warehouse')
    if (database === undefined) {
      throw new Error('no database')
    }

    connections.splice(0)

    expect(sut.getTreeItem(database).iconPath).toStrictEqual(icon('database', 'charts.yellow'))
  })

  it('should paint the databases and schemas of a find in the color of their connection', async () => {
    const { sut, index } = await connected([WAREHOUSE])
    sut.setFind('item')
    await index.load()

    const [warehouse] = await childrenOf(sut)
    const [database] = await childrenOf(sut, warehouse)
    const [schema] = await childrenOf(sut, database)
    const iconOf = (node: typeof database): unknown =>
      node === undefined ? undefined : sut.getTreeItem(node).iconPath

    expect(iconOf(database)).toStrictEqual(icon('database', 'charts.purple'))
    expect(iconOf(schema)).toStrictEqual(icon('symbol-namespace', 'charts.purple'))
  })
})
