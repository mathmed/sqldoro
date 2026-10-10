import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, pg, pgRequest, type ScriptedQuery } from '../../../test/fakes/pg.ts'
import { CatalogDetail } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { postgresEngine } from './postgres-engine.ts'

vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { FakeClient } = await import('../../../test/fakes/pg.ts')
  return { default: { ...original.default, Client: FakeClient } }
})
vi.mock('pg-cursor', async () => {
  const { FakeCursor } = await import('../../../test/fakes/pg.ts')
  return { default: FakeCursor }
})

const SCOPE = { database: 'shop', schema: 'public' }
const TABLES_WITH_STATS = 'SELECT c.relname AS name,\n'
const NOT_EXACT = new TypeError('"estimatedRows" must be a whole number of 0 or more, as text')

async function connected(): Promise<EngineSession> {
  return postgresEngine.connect(pgRequest())
}

// The one statement a client of the session sent besides the description of the session.
function onlyQuery(client: number): ScriptedQuery {
  const queries =
    pg.clients.at(client)?.queries.filter((query) => !query.sql.includes('pg_backend_pid')) ?? []
  const [query] = queries
  if (query === undefined || queries.length > 1) {
    throw new Error(`expected one catalog query, got ${String(queries.length)}`)
  }
  return query
}

beforeEach(() => {
  pg.reset()
})

describe('the statistics of the PostgreSQL catalog', () => {
  it('should read the size of each database the user may see in the query that lists them', async () => {
    answerBy([
      [
        'SELECT datname AS name,',
        {
          rows: [
            { name: 'postgres', sizeBytes: null },
            { name: 'shop', sizeBytes: '2147483648' },
          ],
        },
      ],
    ])
    const sut = await connected()

    await expect(sut.listDatabases(CatalogDetail.Statistics)).resolves.toStrictEqual([
      { name: 'postgres', stats: { sizeBytes: undefined } },
      { name: 'shop', stats: { sizeBytes: 2_147_483_648n } },
    ])
    expect(onlyQuery(0).values).toStrictEqual([])
    expect(onlyQuery(0).sql).toContain(
      "CASE WHEN has_database_privilege(oid, 'CONNECT') OR pg_has_role('pg_read_all_stats', 'MEMBER')",
    )
    expect(pg.clients).toHaveLength(1)
  })

  it('should read the statistics of each table in the query that lists them, in its database', async () => {
    answerBy([
      [
        TABLES_WITH_STATS,
        {
          rows: [
            { name: 'orders', estimatedRows: '27412', sizeBytes: '33554432' },
            { name: 'remote', estimatedRows: null, sizeBytes: null },
          ],
        },
      ],
    ])
    const sut = await connected()

    await expect(
      sut.listTables({ database: 'analytics', schema: 'public' }, CatalogDetail.Statistics),
    ).resolves.toStrictEqual([
      { name: 'orders', stats: { estimatedRows: 27_412n, sizeBytes: 33_554_432n } },
      { name: 'remote', stats: { estimatedRows: undefined, sizeBytes: undefined } },
    ])
    expect(onlyQuery(1).values).toStrictEqual(['public'])
    expect(onlyQuery(1).sql).toContain('pg_total_relation_size(c.oid)')
  })

  it('should refuse statistics that are not exact whole numbers', async () => {
    answerBy([
      [TABLES_WITH_STATS, { rows: [{ name: 'orders', estimatedRows: '-1', sizeBytes: '0' }] }],
    ])
    const sut = await connected()

    await expect(sut.listTables(SCOPE, CatalogDetail.Statistics)).rejects.toThrow(NOT_EXACT)
  })

  it('should show the server message when the statistics cannot be read', async () => {
    answerBy([
      [TABLES_WITH_STATS, { error: new Error('function pg_partition_tree does not exist') }],
    ])
    const sut = await connected()

    await expect(sut.listTables(SCOPE, CatalogDetail.Statistics)).rejects.toThrow(
      'function pg_partition_tree does not exist',
    )
  })
})
