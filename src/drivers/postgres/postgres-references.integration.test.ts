import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { queryRequest } from '../../../test/fakes/query-request.ts'
import { connectRequest, POSTGRES, waitUntilReady } from '../../../test/integration/servers.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { QueryValue, Row } from '../../core/engine/query.ts'
import { tableReadQuery } from '../../core/results/table-query.ts'
import { postgresEngine } from './postgres-engine.ts'

const SCHEMA = 'it_nav'
const OTHER = 'it_nav_other'
const BIG_ID = '9007199254740993'
const FIXTURE = [
  `DROP SCHEMA IF EXISTS ${OTHER} CASCADE`,
  `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`,
  `CREATE SCHEMA ${SCHEMA}`,
  `CREATE SCHEMA ${OTHER}`,
  `CREATE TYPE ${SCHEMA}.mood AS ENUM ('sad', 'ok', 'happy')`,
  `CREATE TABLE ${SCHEMA}.condominium (id bigint PRIMARY KEY, name text NOT NULL, mood ${SCHEMA}.mood)`,
  `CREATE TABLE ${SCHEMA}.account (
    id int PRIMARY KEY,
    condominium_id bigint REFERENCES ${SCHEMA}.condominium (id),
    parent_id int REFERENCES ${SCHEMA}.account (id),
    bank text NOT NULL)`,
  `CREATE TABLE ${SCHEMA}.region (country text, code text, name text, PRIMARY KEY (country, code))`,
  `CREATE TABLE ${OTHER}.branch (
    id int PRIMARY KEY,
    country text,
    code text,
    account_id int REFERENCES ${SCHEMA}.account (id),
    CONSTRAINT branch_region FOREIGN KEY (country, code) REFERENCES ${SCHEMA}.region (country, code))`,
  `INSERT INTO ${SCHEMA}.condominium VALUES (1, 'One', 'happy'), (${BIG_ID}, 'Big', NULL),
    (9007199254740992, 'Almost', 'sad')`,
  `INSERT INTO ${SCHEMA}.account VALUES (10, 1, NULL, 'A'), (11, 1, 10, 'B'), (12, NULL, 11, 'C'),
    (13, ${BIG_ID}, NULL, 'D')`,
  `INSERT INTO ${SCHEMA}.region VALUES ('BR', 'SC', 'Santa Catarina'), ('BR', 'SP', 'São Paulo')`,
  `INSERT INTO ${OTHER}.branch VALUES (1, 'BR', 'SC', 11)`,
]
const CLEANUP = [
  `DROP SCHEMA IF EXISTS ${OTHER} CASCADE`,
  `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`,
]

let session: EngineSession

function table(name: string, schema = SCHEMA): { database: string; schema: string; name: string } {
  return { database: POSTGRES.database, schema, name }
}

async function rowsOf(sql: string, values: readonly QueryValue[]): Promise<readonly Row[]> {
  return (await session.execute(queryRequest({ sql, values, maxRows: 100 })).result).rows
}

describe('the references between PostgreSQL tables against a real server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await postgresEngine.connect(connectRequest(POSTGRES))
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
    await expect(session.listReferences(table('condominium'))).resolves.toStrictEqual([
      {
        name: 'account_condominium_id_fkey',
        schema: SCHEMA,
        table: 'account',
        columns: ['condominium_id'],
        referencedColumns: ['id'],
      },
    ])
  })

  it('should list a self reference and a reference from another schema', async () => {
    const references = await session.listReferences(table('account'))

    expect(
      references.map(({ schema, table: name, columns }) => [schema, name, columns]),
    ).toStrictEqual([
      [SCHEMA, 'account', ['parent_id']],
      [OTHER, 'branch', ['account_id']],
    ])
  })

  it('should pair the columns of a composite foreign key in order', async () => {
    await expect(session.listReferences(table('region'))).resolves.toStrictEqual([
      {
        name: 'branch_region',
        schema: OTHER,
        table: 'branch',
        columns: ['country', 'code'],
        referencedColumns: ['country', 'code'],
      },
    ])
    await expect(session.listReferences(table('branch', OTHER))).resolves.toStrictEqual([])
  })

  it('should describe a table by its place, with the values of its enum', async () => {
    const description = await session.describeTableAt(table('condominium'))

    expect(description?.ref).toStrictEqual(table('condominium'))
    expect(description?.keys).toStrictEqual([['id']])
    expect(description?.columns.find(({ name }) => name === 'mood')?.value).toStrictEqual({
      type: 'choice',
      options: ['sad', 'ok', 'happy'],
      isMultiple: false,
    })
    await expect(session.describeTableAt(table('gone'))).resolves.toBeUndefined()
  })

  it('should read the row a key leads to, exactly, with bound values', async () => {
    const query = tableReadQuery(
      {
        table: table('condominium'),
        key: { parts: [{ column: 'id', value: BIG_ID }], isRowKey: true },
        condition: '',
        view: { filters: [], sort: [] },
        parameterTypes: new Map(),
      },
      postgresEngine.dialect,
    )
    if ('problem' in query) {
      throw new Error(query.problem)
    }

    await expect(rowsOf(query.sql, query.values)).resolves.toStrictEqual([[BIG_ID, 'Big', null]])
  })

  it('should read the rows of another schema a composite key leads to', async () => {
    const query = tableReadQuery(
      {
        table: table('branch', OTHER),
        key: {
          parts: [
            { column: 'country', value: 'BR' },
            { column: 'code', value: 'SC' },
          ],
          isRowKey: false,
        },
        condition: 'id > 0',
        view: { filters: [], sort: [{ key: { column: 0, isDescending: true }, name: 'id' }] },
        parameterTypes: new Map(),
      },
      postgresEngine.dialect,
    )
    if ('problem' in query) {
      throw new Error(query.problem)
    }

    await expect(rowsOf(query.sql, query.values)).resolves.toStrictEqual([[1, 'BR', 'SC', 11]])
  })
})
