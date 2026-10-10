import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSession } from '../../../test/fakes/engine.ts'
import { recordingLogger } from '../../../test/fakes/logger.ts'
import {
  type CatalogNeeds,
  NO_NEEDS,
  objectKey,
  scopeKey,
} from '../../core/completion/catalog-needs.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { SchemaCache } from './schema-cache.ts'

const SCOPE = { database: 'shop', schema: 'public' }
const ORDERS = { ...SCOPE, name: 'orders' }
const COLUMN = {
  name: 'id',
  dataType: 'bigint',
  isNullable: false,
  defaultValue: undefined,
  isPrimaryKey: true,
}
const EVERYTHING: CatalogNeeds = {
  hasDatabases: true,
  schemasOf: 'shop',
  scopes: [SCOPE],
  tables: [ORDERS],
}
const SOON = new Promise<never>(() => undefined)

let log: ReturnType<typeof recordingLogger>
let session: EngineSession

beforeEach(() => {
  log = recordingLogger()
  session = fakeSession({
    listDatabases: vi.fn(async () => Promise.resolve([{ name: 'shop' }])),
    listSchemas: vi.fn(async () => Promise.resolve([{ name: 'public' }])),
    listTables: vi.fn(async () => Promise.resolve([{ name: 'orders' }])),
    listViews: vi.fn(async () => Promise.resolve([{ name: 'totals', isMaterialized: false }])),
    listColumns: vi.fn(async () => Promise.resolve([COLUMN])),
  })
})

describe('SchemaCache', () => {
  it('should load what a request needs', async () => {
    const sut = new SchemaCache(log)

    await expect(
      sut.load('shop', session, { needs: EVERYTHING, deadline: SOON }),
    ).resolves.toStrictEqual({
      catalog: {
        databases: ['shop'],
        schemas: ['public'],
        objects: new Map([[scopeKey(SCOPE), { tables: ['orders'], views: ['totals'] }]]),
        columns: new Map([[objectKey(ORDERS), [COLUMN]]]),
      },
      isComplete: true,
    })
    expect(session.listSchemas).toHaveBeenCalledWith('shop')
    expect(session.listColumns).toHaveBeenCalledWith(ORDERS)
  })

  it('should load each list once, per connection, until it is invalidated', async () => {
    const sut = new SchemaCache(log)

    await sut.load('shop', session, { needs: EVERYTHING, deadline: SOON })
    await sut.load('shop', session, { needs: EVERYTHING, deadline: SOON })
    await sut.load('other', session, { needs: EVERYTHING, deadline: SOON })
    expect(session.listTables).toHaveBeenCalledTimes(2)

    sut.invalidate('shop')
    await sut.load('shop', session, { needs: EVERYTHING, deadline: SOON })
    await sut.load('other', session, { needs: EVERYTHING, deadline: SOON })
    expect(session.listTables).toHaveBeenCalledTimes(3)

    sut.invalidate()
    await sut.load('other', session, { needs: EVERYTHING, deadline: SOON })
    expect(session.listTables).toHaveBeenCalledTimes(4)
  })

  it('should answer with what arrived by the deadline, and say it is not complete', async () => {
    const sut = new SchemaCache(log)
    vi.mocked(session.listColumns).mockReturnValueOnce(SOON)

    const load = await sut.load('shop', session, { needs: EVERYTHING, deadline: Promise.resolve() })

    expect(load.isComplete).toBe(false)
    expect(load.catalog.columns.size).toBe(0)
  })

  it('should ask again for a list that failed, and log it', async () => {
    const sut = new SchemaCache(log)
    vi.mocked(session.listDatabases).mockRejectedValueOnce(new Error('permission denied'))
    const needs = { ...NO_NEEDS, hasDatabases: true }

    await expect(sut.load('shop', session, { needs, deadline: SOON })).resolves.toMatchObject({
      catalog: { databases: [] },
      isComplete: true,
    })
    await expect(sut.load('shop', session, { needs, deadline: SOON })).resolves.toMatchObject({
      catalog: { databases: ['shop'] },
    })
    expect(log.debug).toHaveBeenCalledWith(
      'The autocomplete could not load databases: permission denied',
    )
  })
})
