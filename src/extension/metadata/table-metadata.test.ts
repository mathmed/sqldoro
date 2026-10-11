import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSession } from '../../../test/fakes/engine.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import { ORDERS, tableColumn } from '../../../test/fixtures/tables.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { SchemaCache } from '../completion/schema-cache.ts'
import { parameterTypesOf } from './parameter-types.ts'
import { type CatalogSource, TableMetadata } from './table-metadata.ts'

const ORDERS_REF = { database: 'shop', schema: 'sales', name: 'orders' }
const SIGNED = { parameterType: 'SIGNED', comparedAs: '', collation: '' }
const FOREIGN_KEY = {
  name: 'orders_customer',
  columns: ['customer_id'],
  referencedSchema: 'crm',
  referencedTable: 'customers',
  referencedColumns: ['id'],
  onUpdate: 'NO ACTION',
  onDelete: 'CASCADE',
}
const REFERENCE = {
  name: 'lines_order',
  schema: 'sales',
  table: 'lines',
  columns: ['order_id'],
  referencedColumns: ['id'],
}

let session: EngineSession
let cache: SchemaCache
let source: CatalogSource

beforeEach(() => {
  session = fakeSession({
    describeTable: vi.fn(async () => Promise.resolve(ORDERS)),
    describeTableAt: vi.fn(async () =>
      Promise.resolve({
        ...ORDERS,
        columns: [tableColumn('id', { sql: SIGNED }), tableColumn('code')],
      }),
    ),
    listForeignKeys: vi.fn(async () => Promise.resolve([FOREIGN_KEY])),
    listReferences: vi.fn(async () => Promise.resolve([REFERENCE])),
  })
  cache = new SchemaCache(recordingLogger())
  source = { connectionId: 'shop', session, dialect: { hasSchemas: true } }
})

describe('TableMetadata', () => {
  it('should describe the table of result columns once, until the cache is cleared', async () => {
    const sut = new TableMetadata(cache)

    await sut.describe(source, { database: '', table: ['16510'] })
    await expect(sut.describe(source, { database: '', table: ['16510'] })).resolves.toBe(ORDERS)
    cache.invalidate('shop')
    await sut.describe(source, { database: '', table: ['16510'] })

    expect(session.describeTable).toHaveBeenCalledTimes(2)
    expect(session.describeTable).toHaveBeenCalledWith('', ['16510'])
  })

  it('should read where the foreign keys of a table lead and what points at it', async () => {
    const sut = new TableMetadata(cache)

    const relations = await sut.relations(source, ORDERS_REF)
    await sut.relations(source, ORDERS_REF)

    expect(relations).toStrictEqual({
      foreignKeys: [
        {
          name: 'orders_customer',
          columns: ['customer_id'],
          target: { database: 'shop', schema: 'crm', name: 'customers' },
          targetColumns: ['id'],
        },
      ],
      references: [
        {
          name: 'lines_order',
          table: { database: 'shop', schema: 'sales', name: 'lines' },
          columns: ['order_id'],
          referencedColumns: ['id'],
        },
      ],
    })
    expect(session.listForeignKeys).toHaveBeenCalledOnce()
    expect(session.listReferences).toHaveBeenCalledExactlyOnceWith(ORDERS_REF)
  })

  it('should give the type each column is compared as, where the catalog says', async () => {
    const sut = new TableMetadata(cache)

    await expect(sut.parameterTypes(source, ORDERS_REF)).resolves.toStrictEqual(
      new Map([['id', 'SIGNED']]),
    )
    expect(session.describeTableAt).toHaveBeenCalledExactlyOnceWith(ORDERS_REF)
  })

  it('should give no types for a table the catalog does not know', async () => {
    const sut = new TableMetadata(cache)
    source = {
      ...source,
      session: fakeSession({ describeTableAt: async () => Promise.resolve(undefined) }),
    }

    await expect(sut.parameterTypes(source, ORDERS_REF)).resolves.toStrictEqual(new Map())
  })
})

describe('parameterTypesOf', () => {
  const TARGET = {
    connection: { id: 'shop' },
    engine: { dialect: { hasSchemas: true } },
  } as unknown as Parameters<typeof parameterTypesOf>[1]

  it('should read the types on the session of the explorer', async () => {
    const log = recordingLogger()
    const catalogOf = vi.fn(async () => Promise.resolve(session))

    const sut = await parameterTypesOf(
      { metadata: new TableMetadata(cache), catalogOf, log },
      TARGET,
      ORDERS_REF,
    )

    expect(sut).toStrictEqual(new Map([['id', 'SIGNED']]))
    expect(catalogOf).toHaveBeenCalledWith({ id: 'shop' })
  })

  it('should send the values as they are, and say why, when the catalog cannot be read', async () => {
    const log = recordingLogger()
    const catalogOf = vi.fn(async () => Promise.reject(new Error('connection refused')))

    const sut = await parameterTypesOf(
      { metadata: new TableMetadata(cache), catalogOf, log },
      TARGET,
      ORDERS_REF,
    )

    expect(sut).toStrictEqual(new Map())
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      'Could not read how the values of a table compare from the catalog: connection refused',
    )
  })
})
