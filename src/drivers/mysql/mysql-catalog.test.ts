import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerBy, mysql, mysqlRequest, type ScriptedQuery } from '../../../test/fakes/mysql2.ts'
import { CatalogDetail } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { mysqlEngine } from './mysql-engine.ts'

vi.mock('mysql2', async (importOriginal) => {
  const original = await importOriginal<{ default: object }>()
  const { createConnection } = await import('../../../test/fakes/mysql2.ts')
  return { default: { ...original.default, createConnection } }
})

const SCOPE = { database: 'shop', schema: 'shop' }
const NOT_EXACT = new TypeError('"estimatedRows" must be a whole number of 0 or more, as text')

async function connected(): Promise<EngineSession> {
  return mysqlEngine.connect(mysqlRequest())
}

// The one statement the session sent after it read the version.
function onlyQuery(): ScriptedQuery {
  const queries = mysql.connections[0]?.queries.slice(1) ?? []
  const [query] = queries
  if (query === undefined || queries.length > 1) {
    throw new Error(`expected one catalog query, got ${String(queries.length)}`)
  }
  return query
}

beforeEach(() => {
  mysql.reset()
  answerBy()
})

describe('the statistics of the MySQL catalog', () => {
  it('should read the size of each database in the query that lists them', async () => {
    answerBy([
      [
        'SELECT s.SCHEMA_NAME',
        {
          result: [
            { name: 'information_schema', sizeBytes: null },
            { name: 'shop', sizeBytes: '18446744073709551615' },
          ],
        },
      ],
    ])
    const sut = await connected()

    await expect(sut.listDatabases(CatalogDetail.Statistics)).resolves.toStrictEqual([
      { name: 'information_schema', stats: { sizeBytes: undefined } },
      { name: 'shop', stats: { sizeBytes: 18_446_744_073_709_551_615n } },
    ])
    expect(onlyQuery().values).toStrictEqual(['BASE TABLE'])
    expect(onlyQuery().sql).toContain(
      'CAST(SUM(t.DATA_LENGTH + t.INDEX_LENGTH) AS CHAR) AS sizeBytes',
    )
  })

  it('should read the statistics of each table in the query that lists them', async () => {
    answerBy([
      [
        'SELECT TABLE_NAME AS name, CAST',
        {
          result: [
            { name: 'orders', estimatedRows: '27412', sizeBytes: '33554432' },
            { name: 'broken', estimatedRows: null, sizeBytes: null },
          ],
        },
      ],
    ])
    const sut = await connected()

    await expect(sut.listTables(SCOPE, CatalogDetail.Statistics)).resolves.toStrictEqual([
      { name: 'orders', stats: { estimatedRows: 27_412n, sizeBytes: 33_554_432n } },
      { name: 'broken', stats: { estimatedRows: undefined, sizeBytes: undefined } },
    ])
    expect(onlyQuery().values).toStrictEqual(['shop', 'BASE TABLE'])
    expect(onlyQuery().sql).toContain('CAST(TABLE_ROWS AS CHAR) AS estimatedRows')
  })

  it('should refuse statistics that are not exact whole numbers', async () => {
    answerBy([
      [
        'SELECT TABLE_NAME AS name, CAST',
        { result: [{ name: 'orders', estimatedRows: 27_412, sizeBytes: '0' }] },
      ],
    ])
    const sut = await connected()

    await expect(sut.listTables(SCOPE, CatalogDetail.Statistics)).rejects.toThrow(NOT_EXACT)
  })

  it('should show the server message when the statistics cannot be read', async () => {
    answerBy([['SELECT s.SCHEMA_NAME', { error: new Error('SELECT command denied') }]])
    const sut = await connected()

    await expect(sut.listDatabases(CatalogDetail.Statistics)).rejects.toThrow(
      'SELECT command denied',
    )
  })
})

describe('the references to a MySQL table', () => {
  it('should describe the foreign keys of other tables that point at the table', async () => {
    const column = (table: string, columns: readonly [string, string]): Record<string, string> => ({
      tableSchema: 'shop',
      tableName: table,
      constraintName: 'fk_order',
      columnName: columns[0],
      referencedColumn: columns[1],
    })
    answerBy([
      [
        'SELECT k.TABLE_SCHEMA',
        {
          result: [
            column('lines', ['order_id', 'id']),
            column('lines', ['order_region', 'region']),
            { ...column('returns', ['order_id', 'id']), tableSchema: 'archive' },
          ],
        },
      ],
    ])
    const sut = await connected()

    await expect(sut.listReferences({ ...SCOPE, name: 'orders' })).resolves.toStrictEqual([
      {
        name: 'fk_order',
        schema: 'shop',
        table: 'lines',
        columns: ['order_id', 'order_region'],
        referencedColumns: ['id', 'region'],
      },
      {
        name: 'fk_order',
        schema: 'archive',
        table: 'returns',
        columns: ['order_id'],
        referencedColumns: ['id'],
      },
    ])
    expect(mysql.connections[0]?.queries.at(-1)?.values).toStrictEqual(['shop', 'orders'])
  })
})
