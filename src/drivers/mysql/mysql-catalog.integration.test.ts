import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { queryRequest } from '../../../test/fakes/query-request.ts'
import { connectRequest, MYSQL, waitUntilReady } from '../../../test/integration/servers.ts'
import { CatalogDetail } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { mysqlEngine } from './mysql-engine.ts'

const SCOPE = { database: MYSQL.database, schema: MYSQL.database }
const ROWS = 1000
const TABLE = 'it_stats_orders'
const VIEW = 'it_stats_view'
const FIXTURE = [
  `DROP VIEW IF EXISTS ${VIEW}`,
  `DROP TABLE IF EXISTS ${TABLE}`,
  `CREATE TABLE ${TABLE} (id INT PRIMARY KEY, note VARCHAR(200)) ENGINE=InnoDB`,
  `INSERT INTO ${TABLE} (id, note)
    WITH RECURSIVE seq (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ${String(ROWS)})
    SELECT n, REPEAT('x', 100) FROM seq`,
  `CREATE VIEW ${VIEW} AS SELECT id FROM ${TABLE}`,
  // The statistics information_schema shows are cached: ANALYZE TABLE reads them again.
  `ANALYZE TABLE ${TABLE}`,
]
const CLEANUP = [`DROP VIEW IF EXISTS ${VIEW}`, `DROP TABLE IF EXISTS ${TABLE}`]

let session: EngineSession

async function run(sql: string): Promise<void> {
  await session.execute(queryRequest({ sql, maxRows: 10, onRows: () => undefined })).result
}

describe('the MySQL catalog statistics against a real server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await mysqlEngine.connect(connectRequest(MYSQL))
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

  it('should read the estimated rows and the size of a table, and list no view', async () => {
    const tables = await session.listTables(SCOPE, CatalogDetail.Statistics)
    const stats = tables.find((table) => table.name === TABLE)?.stats

    expect(stats?.estimatedRows).toBeGreaterThan(0n)
    expect(stats?.estimatedRows).toBeLessThanOrEqual(BigInt(2 * ROWS))
    expect(stats?.sizeBytes).toBeGreaterThan(0n)
    expect(tables.map((table) => table.name)).not.toContain(VIEW)
  })

  it('should list the same tables with their names only', async () => {
    const tables = await session.listTables(SCOPE, CatalogDetail.Statistics)
    const names = await session.listTables(SCOPE, CatalogDetail.Names)

    expect(names).toStrictEqual(tables.map(({ name }) => ({ name })))
  })

  it('should read the size of each database from its tables', async () => {
    const databases = await session.listDatabases(CatalogDetail.Statistics)
    const names = await session.listDatabases(CatalogDetail.Names)

    expect(databases.map(({ name }) => ({ name }))).toStrictEqual(names)
    expect(
      databases.find((database) => database.name === MYSQL.database)?.stats?.sizeBytes,
    ).toBeGreaterThan(0n)
    expect(databases).toContainEqual({
      name: 'information_schema',
      stats: { sizeBytes: undefined },
    })
  })
})
