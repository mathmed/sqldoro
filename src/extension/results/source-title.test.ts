import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { CRM, MYSQL_ENGINE, POSTGRES_ENGINE, SHOP } from '../../../test/support/query.ts'
import { Uri } from '../../../test/vscode.ts'
import { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { tableUri } from '../tables/table-uri.ts'
import { sourceTitle, type TitleSources } from './source-title.ts'

const ORDERS = { database: 'shop', schema: 'sales', name: 'orders' }
const CUSTOMERS = { database: 'crm', schema: 'crm', name: 'customers' }

function sources(connections: TitleSources['connections']): TitleSources {
  return {
    connections,
    engines: new EngineRegistry([POSTGRES_ENGINE, MYSQL_ENGINE]),
    tableOf: () => undefined,
  }
}

const SAVED = sources((id) => [SHOP, CRM].find((connection) => connection.id === id))

describe('sourceTitle', () => {
  it('should name the results of a SQL editor by its document', () => {
    const document = Uri.parse('file:/work/report.sql') as unknown as vscode.Uri

    expect(sourceTitle(document, SAVED)).toBe('Results: report.sql')
  })

  it('should name a table by its connection, its database, then its schema and its name', () => {
    expect(
      sourceTitle(tableUri({ connectionId: SHOP.id, table: ORDERS, instance: '' }), SAVED),
    ).toBe('Shop/shop/sales.orders')
    expect(
      sourceTitle(tableUri({ connectionId: CRM.id, table: CUSTOMERS, instance: '' }), SAVED),
    ).toBe('CRM/crm/customers')
  })

  it('should name a table panel after the table it shows now', () => {
    const moved = { ...SAVED, tableOf: () => ({ ...ORDERS, name: 'lines' }) }

    expect(
      sourceTitle(tableUri({ connectionId: SHOP.id, table: ORDERS, instance: 'x' }), moved),
    ).toBe('Shop/shop/sales.lines')
  })

  it('should name the connection as it is named now', () => {
    const renamed = sources(() => ({ ...SHOP, name: 'Store' }))

    expect(
      sourceTitle(tableUri({ connectionId: SHOP.id, table: ORDERS, instance: '' }), renamed),
    ).toBe('Store/shop/sales.orders')
  })

  it('should name a table by itself once its connection or its engine is gone', () => {
    const uri = tableUri({ connectionId: SHOP.id, table: ORDERS, instance: '' })

    expect(
      sourceTitle(
        uri,
        sources(() => undefined),
      ),
    ).toBe('orders — sales')
    expect(
      sourceTitle(
        uri,
        sources(() => ({ ...SHOP, engine: 'oracle' })),
      ),
    ).toBe('orders — sales')
  })
})
