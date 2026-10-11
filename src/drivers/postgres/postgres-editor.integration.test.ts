import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectRequest, POSTGRES, waitUntilReady } from '../../../test/integration/servers.ts'
import { ObjectKind, type ObjectRef } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { QueryError } from '../../core/engine/query-error.ts'
import { QueryCancelledError, type QueryRequest } from '../../core/engine/query.ts'
import { FilterOperator } from '../../core/results/conditions.ts'
import { locateError } from '../../core/results/error-location.ts'
import { explainStatement, planLines } from '../../core/results/plan.ts'
import { serverViewQuery } from '../../core/results/server-view.ts'
import { splitStatements } from '../../core/sql/statements.ts'
import { postgresEngine } from './postgres-engine.ts'

const SCHEMA = 'it_editor'
const SCOPE = { database: POSTGRES.database, schema: SCHEMA }
const ITEMS: ObjectRef = { ...SCOPE, name: 'items' }
const MILLION = 1_000_000

let session: EngineSession

async function run(
  sql: string,
  changes: Partial<QueryRequest> = {},
): ReturnType<EngineSession['execute']>['result'] {
  return session.execute({
    sql,
    values: [],
    maxRows: 1000,
    onColumns: () => undefined,
    onRows: () => undefined,
    ...changes,
  }).result
}

async function catalogOf(table: ObjectRef): Promise<unknown[]> {
  return Promise.all([
    session.listColumns(table),
    session.listIndexes(table),
    session.listForeignKeys(table),
  ])
}

describe('postgresEngine for the SQL editor, against a real PostgreSQL server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await postgresEngine.connect(connectRequest(POSTGRES))
    })
    for (const statement of [
      `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`,
      `CREATE SCHEMA ${SCHEMA}`,
      `CREATE TABLE ${SCHEMA}.owners (id int PRIMARY KEY)`,
      `CREATE TABLE ${SCHEMA}.items (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        owner_id int REFERENCES ${SCHEMA}.owners (id) ON DELETE CASCADE,
        price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
        double_price numeric GENERATED ALWAYS AS (price * 2) STORED,
        code text UNIQUE,
        "Mixed Case" text
      )`,
      `CREATE INDEX items_price ON ${SCHEMA}.items (price DESC)`,
      `CREATE VIEW ${SCHEMA}.cheap AS SELECT id, price FROM ${SCHEMA}.items WHERE price < 10`,
    ]) {
      await run(statement)
    }
  })

  afterAll(async () => {
    await session.close()
  })

  it('should keep every value exact and tell what each column holds', async () => {
    const result =
      await run(`SELECT 9223372036854775807::int8 AS big, 1234567890.0123456789::numeric AS exact,
      'NaN'::float8 AS nan, '-infinity'::float8 AS low, '2024-02-29'::date AS day, '1 day 02:00'::interval AS span,
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid AS id, '\\xdeadbeef'::bytea AS raw, ARRAY['a', 'b;c'] AS list`)

    expect(result.columns.map((column) => `${column.name}:${column.kind}`)).toStrictEqual([
      'big:number',
      'exact:number',
      'nan:number',
      'low:number',
      'day:temporal',
      'span:temporal',
      'id:text',
      'raw:binary',
      'list:other',
    ])
    expect(result.rows).toStrictEqual([
      [
        '9223372036854775807',
        '1234567890.0123456789',
        Number.NaN,
        Number.NEGATIVE_INFINITY,
        '2024-02-29',
        '1 day 02:00:00',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        '0xdeadbeef',
        '{a,b;c}',
      ],
    ])
  })

  it('should bind values to the numbered parameters', async () => {
    await expect(
      run("SELECT '$1' AS literal, $1::text AS a, $2::int AS b, $3::text IS NULL AS c", {
        values: ['x', 2, null],
      }),
    ).resolves.toMatchObject({ rows: [['$1', 'x', 2, true]] })
  })

  it('should run later statements in the schema, then in another database, then cancel there', async () => {
    await session.useScope(SCOPE)
    await expect(run('SELECT count(*)::int AS n FROM items')).resolves.toMatchObject({
      rows: [[0]],
    })
    await expect(run('SHOW search_path')).resolves.toMatchObject({ rows: [[`${SCHEMA}, public`]] })

    await session.useScope({ database: 'postgres', schema: '' })
    await expect(run('SELECT current_database()')).resolves.toMatchObject({ rows: [['postgres']] })
    const sleeping = session.execute({
      sql: 'SELECT pg_sleep(20)',
      values: [],
      maxRows: 1,
      onColumns: () => undefined,
      onRows: () => undefined,
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await sleeping.cancel()
    await expect(sleeping.result).rejects.toBeInstanceOf(QueryCancelledError)

    await session.useScope({ database: POSTGRES.database, schema: '' })
    await expect(run('SELECT current_database()')).resolves.toMatchObject({
      rows: [[POSTGRES.database]],
    })
  })

  it('should rebuild the DDL of a table that builds the same table again', async () => {
    const ddl = await session.objectDdl(ITEMS, ObjectKind.Table)
    const viewDdl = await session.objectDdl({ ...SCOPE, name: 'cheap' }, ObjectKind.View)
    const before = await catalogOf(ITEMS)

    await run(`DROP TABLE ${SCHEMA}.items CASCADE`)
    for (const statement of splitStatements(ddl, postgresEngine.dialect.lexical)) {
      await run(statement.text)
    }
    await run(viewDdl)

    expect(ddl).toContain(
      '"double_price" numeric GENERATED ALWAYS AS ((price * (2)::numeric)) STORED',
    )
    expect(ddl).toContain('CREATE INDEX items_price ON it_editor.items USING btree (price DESC);')
    expect(viewDdl).toMatch(/^CREATE OR REPLACE VIEW "it_editor"."cheap" AS\nSELECT/)
    await expect(catalogOf(ITEMS)).resolves.toStrictEqual(before)
  })

  it('should explain a query, and measure it with EXPLAIN ANALYZE', async () => {
    const plan = await run(
      explainStatement(`SELECT * FROM ${SCHEMA}.items`, postgresEngine.dialect, false),
    )
    const measured = await run(explainStatement('SELECT 1', postgresEngine.dialect, true))

    expect(planLines(plan)[0]).toMatch(/Scan on items/)
    expect(planLines(measured).join('\n')).toMatch(/actual time/)
  })

  it('should locate an error at the character the server pointed at', async () => {
    const statement = "SELECT '😀' AS smile FORM it"

    const error: unknown = await run(statement).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(QueryError)
    const range = locateError((error as QueryError).location, statement)
    expect(statement.slice(range.start, range.end)).toBe('FORM')
  })

  it('should stream a million rows in batches', async () => {
    let batches = 0

    const result = await run(`SELECT generate_series(1, ${String(MILLION)}) AS n`, {
      maxRows: MILLION,
      onRows: () => {
        batches += 1
      },
    })

    expect(result.rows).toHaveLength(MILLION)
    expect(result.rows.at(-1)).toStrictEqual([MILLION])
    expect(result.isTruncated).toBe(false)
    expect(batches).toBe(MILLION / 500)
  })

  it('should cancel a statement while it streams its rows, and stay usable', async () => {
    const execution = session.execute({
      sql: 'SELECT generate_series(1, 100000000) AS n',
      values: [],
      maxRows: 100_000_000,
      onColumns: () => undefined,
      onRows: () => {
        void execution.cancel()
      },
    })

    await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
    await expect(run('SELECT 7 AS seven')).resolves.toMatchObject({ rows: [[7]] })
  })

  it('should sort and filter a query on the server with bound values', async () => {
    const statement = "SELECT * FROM (VALUES ('a1'), ('b12'), ('C1'), ('d3')) AS t(code)"
    const query = serverViewQuery(
      statement,
      {
        sort: [{ column: 0, isDescending: true }],
        filters: [{ column: 0, operator: FilterOperator.Contains, values: ['c1'] }],
      },
      {
        columns: [{ name: 'code', dataType: 'TEXT', kind: 'text' }],
        parameterTypes: new Map(),
        dialect: postgresEngine.dialect,
      },
    )

    await expect(run(query?.sql ?? '', { values: query?.values ?? [] })).resolves.toMatchObject({
      rows: [['C1']],
    })
  })

  it('should run a script whose function body has semicolons in dollar quotes', async () => {
    const script = `CREATE OR REPLACE FUNCTION ${SCHEMA}.twice(n int) RETURNS int AS $body$
BEGIN
  RETURN n * 2; -- a comment; inside
END;
$body$ LANGUAGE plpgsql;
/* a block /* nested; */ comment */ SELECT ${SCHEMA}.twice(21) AS answer, E'it\\'s;' AS text;`

    const results = []
    for (const statement of splitStatements(script, postgresEngine.dialect.lexical)) {
      results.push(await run(statement.text))
    }

    expect(results).toHaveLength(2)
    expect(results.at(-1)?.rows).toStrictEqual([[42, "it's;"]])
  })
})
