import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { queryRequest } from '../../../test/fakes/query-request.ts'
import { connectRequest, MYSQL, waitUntilReady } from '../../../test/integration/servers.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { QueryValue, Row } from '../../core/engine/query.ts'
import { tableReadQuery } from '../../core/results/table-query.ts'
import { mysqlEngine } from './mysql-engine.ts'

const DATABASE = MYSQL.database
const BIG_ID = '9007199254740993'
const TABLES = ['it_nav_branch', 'it_nav_region', 'it_nav_account', 'it_nav_condominium']
const FIXTURE = [
  ...TABLES.map((name) => `DROP TABLE IF EXISTS ${name}`),
  `CREATE TABLE it_nav_condominium (
    id BIGINT PRIMARY KEY, name VARCHAR(50) NOT NULL, mood ENUM('sad', 'ok', 'happy'),
    perks SET('pool', 'gym')) ENGINE=InnoDB`,
  `CREATE TABLE it_nav_account (
    id INT PRIMARY KEY,
    condominium_id BIGINT,
    parent_id INT,
    bank VARCHAR(20) NOT NULL,
    CONSTRAINT it_nav_account_condominium FOREIGN KEY (condominium_id) REFERENCES it_nav_condominium (id),
    CONSTRAINT it_nav_account_parent FOREIGN KEY (parent_id) REFERENCES it_nav_account (id)) ENGINE=InnoDB`,
  `CREATE TABLE it_nav_region (
    country CHAR(2), code CHAR(2), name VARCHAR(50), PRIMARY KEY (country, code)) ENGINE=InnoDB`,
  `CREATE TABLE it_nav_branch (
    id INT PRIMARY KEY,
    country CHAR(2),
    code CHAR(2),
    CONSTRAINT it_nav_branch_region FOREIGN KEY (country, code) REFERENCES it_nav_region (country, code)) ENGINE=InnoDB`,
  `INSERT INTO it_nav_condominium VALUES (1, 'One', 'happy', 'pool,gym'), (${BIG_ID}, 'Big', NULL, ''),
    (9007199254740992, 'Almost', 'sad', 'gym')`,
  `INSERT INTO it_nav_account VALUES (10, 1, NULL, 'A'), (11, 1, 10, 'B'), (12, NULL, 11, 'C'),
    (13, ${BIG_ID}, NULL, 'D')`,
  `INSERT INTO it_nav_region VALUES ('BR', 'SC', 'Santa Catarina'), ('BR', 'SP', 'Sao Paulo')`,
  `INSERT INTO it_nav_branch VALUES (1, 'BR', 'SC')`,
]
const CLEANUP = TABLES.map((name) => `DROP TABLE IF EXISTS ${name}`)

let session: EngineSession

function table(name: string): { database: string; schema: string; name: string } {
  return { database: DATABASE, schema: DATABASE, name }
}

async function rowsOf(sql: string, values: readonly QueryValue[]): Promise<readonly Row[]> {
  return (await session.execute(queryRequest({ sql, values, maxRows: 100 })).result).rows
}

describe('the references between MySQL tables against a real server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await mysqlEngine.connect(connectRequest(MYSQL))
    })
    for (const statement of FIXTURE) {
      await rowsOf(statement, [])
    }
  })

  afterAll(async () => {
    for (const statement of CLEANUP) {
      await rowsOf(statement, [])
    }
    await session.close()
  })

  it('should list the foreign keys of other tables that point at a table', async () => {
    await expect(session.listReferences(table('it_nav_condominium'))).resolves.toStrictEqual([
      {
        name: 'it_nav_account_condominium',
        schema: DATABASE,
        table: 'it_nav_account',
        columns: ['condominium_id'],
        referencedColumns: ['id'],
      },
    ])
  })

  it('should list a self reference and pair a composite foreign key in order', async () => {
    await expect(session.listReferences(table('it_nav_account'))).resolves.toStrictEqual([
      {
        name: 'it_nav_account_parent',
        schema: DATABASE,
        table: 'it_nav_account',
        columns: ['parent_id'],
        referencedColumns: ['id'],
      },
    ])
    await expect(session.listReferences(table('it_nav_region'))).resolves.toStrictEqual([
      {
        name: 'it_nav_branch_region',
        schema: DATABASE,
        table: 'it_nav_branch',
        columns: ['country', 'code'],
        referencedColumns: ['country', 'code'],
      },
    ])
  })

  it('should describe a table by its place, with the values of its enum and set', async () => {
    const description = await session.describeTableAt(table('it_nav_condominium'))
    const valueOf = (name: string): unknown =>
      description?.columns.find((column) => column.name === name)?.value

    expect(description?.keys).toStrictEqual([['id']])
    expect(valueOf('mood')).toStrictEqual({
      type: 'choice',
      options: ['sad', 'ok', 'happy'],
      isMultiple: false,
    })
    expect(valueOf('perks')).toStrictEqual({
      type: 'choice',
      options: ['pool', 'gym'],
      isMultiple: true,
    })
    await expect(session.describeTableAt(table('it_nav_gone'))).resolves.toBeUndefined()
  })

  it('should read the row a key leads to exactly once its value is cast as the catalog says', async () => {
    const description = await session.describeTableAt(table('it_nav_condominium'))
    const parameterType =
      description?.columns.find((column) => column.name === 'id')?.sql.parameterType ?? ''
    const query = tableReadQuery(
      {
        table: table('it_nav_condominium'),
        key: { parts: [{ column: 'id', value: BIG_ID }], isRowKey: true },
        condition: '',
        view: { filters: [], sort: [] },
        parameterTypes: new Map([['id', parameterType]]),
      },
      mysqlEngine.dialect,
    )
    if ('problem' in query) {
      throw new Error(query.problem)
    }

    expect(parameterType).toBe('SIGNED')
    await expect(rowsOf(query.sql, query.values)).resolves.toStrictEqual([
      [BIG_ID, 'Big', null, ''],
    ])
  })

  it('should read the rows a composite key leads to', async () => {
    const query = tableReadQuery(
      {
        table: table('it_nav_branch'),
        key: {
          parts: [
            { column: 'country', value: 'BR' },
            { column: 'code', value: 'SC' },
          ],
          isRowKey: false,
        },
        condition: "code <> '?'",
        view: { filters: [], sort: [] },
        parameterTypes: new Map(),
      },
      mysqlEngine.dialect,
    )
    if ('problem' in query) {
      throw new Error(query.problem)
    }

    await expect(rowsOf(query.sql, query.values)).resolves.toStrictEqual([[1, 'BR', 'SC']])
  })
})
