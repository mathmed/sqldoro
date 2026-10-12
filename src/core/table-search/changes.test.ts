import { describe, expect, it } from 'vitest'

import { foundChanges, mergeChanges, NO_CHANGES } from './changes.ts'
import { findTables, type IndexedConnection, NOTHING_FOUND } from './found.ts'

const SHOP: IndexedConnection = {
  connectionId: 'shop',
  hasSchemas: true,
  isLoading: false,
  scopes: [
    {
      scope: { database: 'shop', schema: 'sales' },
      tables: ['orders', 'order_lines', 'lines'],
      views: ['order_totals'],
    },
    { scope: { database: 'shop', schema: 'audit' }, tables: ['order_events'], views: [] },
  ],
}
const CRM: IndexedConnection = {
  connectionId: 'crm',
  hasSchemas: false,
  isLoading: false,
  scopes: [{ scope: { database: 'crm', schema: 'crm' }, tables: ['orders'], views: [] }],
}
const SALES_TABLES = '["tables","shop","shop","sales"]'
const SALES_VIEWS = '["views","shop","shop","sales"]'
const SHOP_DATABASE = '["database","shop","shop"]'
const CRM_TABLES = '["tables","crm","crm","crm"]'

function changes(
  [before, after]: readonly [string, string],
  connections: readonly IndexedConnection[] = [SHOP, CRM],
): ReturnType<typeof foundChanges> {
  return foundChanges(findTables(connections, before), findTables(connections, after))
}

describe('foundChanges', () => {
  it('should change nothing when the same text finds the same', () => {
    expect(changes(['ord', ' ord '])).toStrictEqual(NO_CHANGES)
  })

  it('should draw again the groups whose matches show the text elsewhere', () => {
    expect(changes(['ord', 'orde'])).toStrictEqual({
      isRootChanged: false,
      keys: new Set([SALES_TABLES, SALES_VIEWS, '["tables","shop","shop","audit"]', CRM_TABLES]),
    })
  })

  it('should draw again the group that lost or gained a match, with its count', () => {
    const sales: IndexedConnection = { ...SHOP, scopes: SHOP.scopes.slice(0, 1) }

    expect(changes(['order', 'order_'], [sales]).keys).toStrictEqual(
      new Set([SALES_TABLES, SALES_VIEWS]),
    )
    expect(changes(['lines', 'line'], [sales]).keys).toStrictEqual(new Set([SALES_TABLES]))
  })

  it('should draw again the parent of a branch that went, and nothing inside it', () => {
    expect(changes(['order_', 'order_l']).keys).toStrictEqual(new Set([SHOP_DATABASE]))
  })

  it('should draw the whole tree again when its connections, or the line it shows, change', () => {
    const loading = { ...SHOP, isLoading: true }

    expect(changes(['ord', 'order_l']).isRootChanged).toBe(true)
    expect(changes(['nothing', 'nothing at all'])).toStrictEqual(NO_CHANGES)
    expect(
      foundChanges(findTables([loading], 'zzz'), findTables([SHOP], 'zzz')).isRootChanged,
    ).toBe(true)
    expect(foundChanges(NOTHING_FOUND, findTables([SHOP], 'zzz')).isRootChanged).toBe(true)
    expect(foundChanges(findTables([], 'zzz'), findTables([SHOP], 'zzz')).isRootChanged).toBe(true)
    expect(foundChanges(findTables([SHOP], 'ord'), NOTHING_FOUND)).toStrictEqual({
      isRootChanged: true,
      keys: new Set(),
    })
  })
})

describe('mergeChanges', () => {
  it('should keep everything either change asks to draw again', () => {
    const groups = { isRootChanged: false, keys: new Set(['a', 'b']) }

    expect(mergeChanges(groups, { isRootChanged: false, keys: new Set(['b', 'c']) })).toStrictEqual(
      { isRootChanged: false, keys: new Set(['a', 'b', 'c']) },
    )
    expect(mergeChanges(NO_CHANGES, { isRootChanged: true, keys: new Set() }).isRootChanged).toBe(
      true,
    )
    expect(mergeChanges(groups, NO_CHANGES).isRootChanged).toBe(false)
  })
})
