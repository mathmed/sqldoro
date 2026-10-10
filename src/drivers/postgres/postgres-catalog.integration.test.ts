import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { queryRequest } from '../../../test/fakes/query-request.ts'
import { connectRequest, POSTGRES, waitUntilReady } from '../../../test/integration/servers.ts'
import { CatalogDetail, type TableInfo } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { postgresEngine } from './postgres-engine.ts'

const SCHEMA = 'it_stats'
const SCOPE = { database: POSTGRES.database, schema: SCHEMA }
const ROWS = 1000
const EVENTS = 200
// A database the reader may not connect to, and a reader who is no superuser.
const PRIVATE_DATABASE = 'it_stats_private'
const READER = 'it_stats_reader'
const FIXTURE = [
  `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`,
  `CREATE SCHEMA ${SCHEMA}`,
  `CREATE TABLE ${SCHEMA}.orders (id int PRIMARY KEY, note text)`,
  `INSERT INTO ${SCHEMA}.orders SELECT n, repeat('x', 100) FROM generate_series(1, ${String(ROWS)}) AS n`,
  `CREATE TABLE ${SCHEMA}.never_analyzed (id int PRIMARY KEY)`,
  `CREATE TABLE ${SCHEMA}.events (id int, at date NOT NULL) PARTITION BY RANGE (at)`,
  `CREATE TABLE ${SCHEMA}.events_2024 PARTITION OF ${SCHEMA}.events
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')`,
  `CREATE TABLE ${SCHEMA}.events_2025 PARTITION OF ${SCHEMA}.events
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01')`,
  `INSERT INTO ${SCHEMA}.events
    SELECT n, date '2024-06-01' + (n * 2) FROM generate_series(1, ${String(EVENTS)}) AS n`,
  `ANALYZE ${SCHEMA}.orders`,
  `ANALYZE ${SCHEMA}.events`,
  `DROP DATABASE IF EXISTS ${PRIVATE_DATABASE}`,
  `CREATE DATABASE ${PRIVATE_DATABASE}`,
  `REVOKE CONNECT ON DATABASE ${PRIVATE_DATABASE} FROM PUBLIC`,
  `DROP ROLE IF EXISTS ${READER}`,
  `CREATE ROLE ${READER} LOGIN PASSWORD '${POSTGRES.password}'`,
]
const CLEANUP = [
  `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`,
  `DROP DATABASE IF EXISTS ${PRIVATE_DATABASE}`,
  `DROP ROLE IF EXISTS ${READER}`,
]

let session: EngineSession

async function run(sql: string): Promise<void> {
  await session.execute(queryRequest({ sql, maxRows: 1, onRows: () => undefined })).result
}

function statsOf(tables: readonly TableInfo[], name: string): TableInfo['stats'] {
  return tables.find((table) => table.name === name)?.stats
}

describe('the PostgreSQL catalog statistics against a real server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await postgresEngine.connect(connectRequest(POSTGRES))
    })
    for (const statement of FIXTURE) {
      await run(statement)
    }
  })

  afterAll(async () => {
    for (const statement of CLEANUP) {
      await run(statement)
    }
    await session.close()
  })

  it('should read the rows and the size of an analyzed table', async () => {
    const tables = await session.listTables(SCOPE, CatalogDetail.Statistics)

    expect(tables.map((table) => table.name)).toStrictEqual(['events', 'never_analyzed', 'orders'])
    expect(statsOf(tables, 'orders')?.estimatedRows).toBe(BigInt(ROWS))
    expect(statsOf(tables, 'orders')?.sizeBytes).toBeGreaterThan(0n)
  })

  it('should leave out the rows of a table never analyzed', async () => {
    const tables = await session.listTables(SCOPE, CatalogDetail.Statistics)

    expect(statsOf(tables, 'never_analyzed')?.estimatedRows).toBeUndefined()
    expect(statsOf(tables, 'never_analyzed')?.sizeBytes).toBeGreaterThan(0n)
  })

  it('should count the partitions of a partitioned table as its own', async () => {
    const tables = await session.listTables(SCOPE, CatalogDetail.Statistics)

    expect(statsOf(tables, 'events')?.estimatedRows).toBe(BigInt(EVENTS))
    expect(statsOf(tables, 'events')?.sizeBytes).toBeGreaterThan(0n)
  })

  it('should list the same tables with their names only', async () => {
    await expect(session.listTables(SCOPE, CatalogDetail.Names)).resolves.toStrictEqual([
      { name: 'events' },
      { name: 'never_analyzed' },
      { name: 'orders' },
    ])
  })

  it('should read the size of every database the user may connect to', async () => {
    const databases = await session.listDatabases(CatalogDetail.Statistics)
    const names = (await session.listDatabases(CatalogDetail.Names)).map(
      (database) => database.name,
    )

    expect(databases.map((database) => database.name)).toStrictEqual(names)
    expect(databases.every((database) => (database.stats?.sizeBytes ?? 0n) > 0n)).toBe(true)
  })

  it('should leave out the size of a database the user may not connect to', async () => {
    const reader = await postgresEngine.connect(connectRequest(POSTGRES, { user: READER }))
    try {
      const databases = await reader.listDatabases(CatalogDetail.Statistics)

      expect(databases).toContainEqual({ name: PRIVATE_DATABASE, stats: { sizeBytes: undefined } })
      expect(
        databases.find((database) => database.name === POSTGRES.database)?.stats?.sizeBytes,
      ).toBeGreaterThan(0n)
    } finally {
      await reader.close()
    }
  })
})
