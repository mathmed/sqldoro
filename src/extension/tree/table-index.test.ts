import { describe, expect, it, vi } from 'vitest'

import { explorer, SHOP } from '../../../test/support/explorer.ts'
import type { TableInfo } from '../../core/engine/catalog.ts'

describe('TableIndex', () => {
  it('should load each connection once, namespace by namespace, until it is forgotten', async () => {
    const listTables = vi.fn(async () => Promise.resolve([{ name: 'orders' }]))
    const { sessions, index } = explorer([SHOP], {
      session: { listSchemas: async () => Promise.resolve([{ name: 'sales' }]), listTables },
    })
    await sessions.connect(SHOP)

    expect(index.snapshot()).toMatchObject([{ connectionId: 'shop', isLoading: true, scopes: [] }])
    await Promise.all([index.load(), index.load()])
    await index.load()

    expect(listTables).toHaveBeenCalledOnce()
    expect(index.snapshot()).toMatchObject([
      {
        connectionId: 'shop',
        hasSchemas: true,
        isLoading: false,
        scopes: [{ scope: { database: 'shop', schema: 'sales' }, tables: ['orders'], views: [] }],
      },
    ])
  })

  it('should drop what a forgotten load brings', async () => {
    const tables = Promise.withResolvers<TableInfo[]>()
    const listTables = vi.fn(async () => tables.promise)
    const { sessions, index } = explorer([SHOP], {
      session: { listSchemas: async () => Promise.resolve([{ name: 'sales' }]), listTables },
    })
    await sessions.connect(SHOP)
    const loading = index.load()
    await vi.waitFor(() => {
      expect(listTables).toHaveBeenCalled()
    })
    const changes = vi.fn()

    index.forget(SHOP.id)
    index.onDidChange(changes)
    tables.resolve([{ name: 'orders' }])
    await loading

    expect(changes).not.toHaveBeenCalled()
    expect(index.snapshot()).toMatchObject([{ isLoading: true, scopes: [] }])
  })

  it('should leave out a connection of an engine sqldoro does not know', async () => {
    const oracle = { ...SHOP, engine: 'oracle' }
    const { sessions, index } = explorer([oracle])
    await sessions.connect(oracle)

    await index.load()

    expect(index.snapshot()).toStrictEqual([])
    await expect(index.objects()).resolves.toStrictEqual([])
  })
})
