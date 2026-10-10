import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectRequest, MYSQL, waitUntilReady } from '../../../test/integration/servers.ts'
import { ObjectKind } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { QueryError } from '../../core/engine/query-error.ts'
import {
  QueryCancelledError,
  type QueryRequest,
  type ResultColumn,
  type Row,
} from '../../core/engine/query.ts'
import { locateError } from '../../core/results/error-location.ts'
import { explainStatement, planLines } from '../../core/results/plan.ts'
import { serverViewQuery } from '../../core/results/server-view.ts'
import { splitStatements } from '../../core/sql/statements.ts'
import { mysqlEngine } from './mysql-engine.ts'

const SCOPE = { database: MYSQL.database, schema: MYSQL.database }
const DIGITS =
  '(SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)'
const HUNDRED_THOUSAND = `SELECT a.n + 10 * b.n + 100 * c.n + 1000 * d.n + 10000 * e.n AS n
FROM ${DIGITS} a CROSS JOIN ${DIGITS} b CROSS JOIN ${DIGITS} c CROSS JOIN ${DIGITS} d CROSS JOIN ${DIGITS} e`

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

describe('mysqlEngine for the SQL editor, against a real MySQL server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await mysqlEngine.connect(connectRequest(MYSQL))
    })
    for (const statement of [
      'DROP VIEW IF EXISTS it_editor_view',
      'DROP TABLE IF EXISTS it_editor',
      `CREATE TABLE it_editor (
        id BIGINT UNSIGNED PRIMARY KEY,
        amount DECIMAL(65, 30) NOT NULL DEFAULT 0,
        at DATETIME(6),
        span TIME,
        born YEAR,
        flags BIT(8),
        raw VARBINARY(8),
        note TEXT,
        mood ENUM('ok', 'bad'),
        doc JSON,
        ratio DOUBLE,
        KEY it_editor_at (at)
      )`,
      'CREATE VIEW it_editor_view AS SELECT id, note FROM it_editor',
    ]) {
      await run(statement)
    }
  })

  afterAll(async () => {
    await session.close()
  })

  it('should describe the columns before the rows and keep every value exact', async () => {
    await run(`INSERT INTO it_editor VALUES (18446744073709551615, 12345678901234567890123456789012345.123456789012345678901234567890,
      '2024-02-29 23:59:59.123456', '-838:59:59', 2155, b'10100101', 0x00ff, 'a;b', 'ok', '{"n": 12345678901234567890}', 0.1)`)
    const events: string[] = []
    let columns: readonly ResultColumn[] = []

    const result = await run('SELECT * FROM it_editor', {
      onColumns: (described) => {
        columns = described
        events.push('columns')
      },
      onRows: () => events.push('rows'),
    })

    expect(events).toStrictEqual(['columns', 'rows'])
    expect(columns.map((column) => `${column.name}:${column.kind}`)).toStrictEqual([
      'id:number',
      'amount:number',
      'at:temporal',
      'span:temporal',
      'born:number',
      'flags:binary',
      'raw:binary',
      'note:text',
      'mood:text',
      'doc:json',
      'ratio:number',
    ])
    expect(result.rows).toStrictEqual([
      [
        '18446744073709551615',
        '12345678901234567890123456789012345.123456789012345678901234567890',
        '2024-02-29 23:59:59.123456',
        '-838:59:59',
        2155,
        '0xa5',
        '0x00ff',
        'a;b',
        'ok',
        '{"n": 12345678901234567890}',
        0.1,
      ],
    ])
  })

  it('should bind values on the server, leaving a ? inside a string alone', async () => {
    await expect(
      run("SELECT 'why?' AS q, ? AS a, ? AS b, ? IS NULL AS c", { values: ['x', 2, null] }),
    ).resolves.toMatchObject({ rows: [['why?', 'x', 2, '1']] })
  })

  it('should run later statements in the database it switches to', async () => {
    await session.useScope({ database: 'information_schema', schema: 'information_schema' })
    await expect(run('SELECT DATABASE() AS db')).resolves.toMatchObject({
      rows: [['information_schema']],
    })

    await session.useScope(SCOPE)
    await expect(run('SELECT DATABASE() AS db')).resolves.toMatchObject({
      rows: [[MYSQL.database]],
    })
  })

  it('should show the DDL of a table and a view, and the table DDL should build the same table', async () => {
    const tableDdl = await session.objectDdl({ ...SCOPE, name: 'it_editor' }, ObjectKind.Table)
    const viewDdl = await session.objectDdl({ ...SCOPE, name: 'it_editor_view' }, ObjectKind.View)
    const columnsBefore = await session.listColumns({ ...SCOPE, name: 'it_editor' })
    const indexesBefore = await session.listIndexes({ ...SCOPE, name: 'it_editor' })

    await run('DROP VIEW it_editor_view')
    await run('DROP TABLE it_editor')
    await run(tableDdl.replace(/;$/, ''))
    await run(viewDdl.replace(/;$/, ''))

    expect(tableDdl).toMatch(/^CREATE TABLE `it_editor` \(/)
    expect(viewDdl).toMatch(/VIEW `it_editor_view` AS select/)
    await expect(session.listColumns({ ...SCOPE, name: 'it_editor' })).resolves.toStrictEqual(
      columnsBefore,
    )
    await expect(session.listIndexes({ ...SCOPE, name: 'it_editor' })).resolves.toStrictEqual(
      indexesBefore,
    )
  })

  it('should explain a query in the tree format, and measure it with EXPLAIN ANALYZE', async () => {
    const plan = await run(
      explainStatement('SELECT * FROM it_editor WHERE id > 1', mysqlEngine.dialect, false),
    )
    const measured = await run(explainStatement('SELECT 1', mysqlEngine.dialect, true))

    expect(planLines(plan).join('\n')).toMatch(/->/)
    expect(planLines(measured).join('\n')).toMatch(/actual time/)
  })

  it('should locate a syntax error on its line, at the text the server quoted', async () => {
    const statement = 'SELECT *\nFORM it_editor'

    const error: unknown = await run(statement).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(QueryError)
    const range = locateError((error as QueryError).location, statement)
    expect(statement.slice(range.start, range.end)).toBe('FORM')
  })

  it('should stream a large result in batches and keep the row limit', async () => {
    const batches: (readonly Row[])[] = []

    const all = await run(HUNDRED_THOUSAND, {
      maxRows: 150_000,
      onRows: (rows) => batches.push(rows),
    })
    const cut = await run(HUNDRED_THOUSAND, { maxRows: 50_000 })

    expect(all.rows).toHaveLength(100_000)
    expect(all.isTruncated).toBe(false)
    expect(batches.length).toBeGreaterThan(100)
    expect(cut.rows).toHaveLength(50_000)
    expect(cut.isTruncated).toBe(true)
  })

  it('should cancel a statement while it streams its rows, and stay usable', async () => {
    const execution = session.execute({
      sql: `${HUNDRED_THOUSAND} CROSS JOIN ${DIGITS} f CROSS JOIN ${DIGITS} g`,
      values: [],
      maxRows: 100_000_000,
      onColumns: () => undefined,
      onRows: () => {
        void execution.cancel()
      },
    })

    await expect(execution.result).rejects.toBeInstanceOf(QueryCancelledError)
    await expect(run('SELECT 7 AS seven')).resolves.toMatchObject({ rows: [['7']] })
  })

  it('should sort and filter a query on the server with bound values', async () => {
    const statement =
      'SELECT n FROM (SELECT 1 AS n UNION ALL SELECT 12 UNION ALL SELECT 21 UNION ALL SELECT 3) AS t'
    const query = serverViewQuery(
      statement,
      { sort: [{ column: 0, isDescending: true }], filters: [{ column: 0, text: '1' }] },
      {
        columns: [{ name: 'n', dataType: 'LONGLONG', kind: 'number' }],
        dialect: mysqlEngine.dialect,
      },
    )

    expect(query).toBeDefined()
    await expect(run(query?.sql ?? '', { values: query?.values ?? [] })).resolves.toMatchObject({
      rows: [['21'], ['12'], ['1']],
    })
  })

  it('should run each statement of a script split on its semicolons', async () => {
    const script = `/*!40101 SET @it_mark = 'a;b' */;
-- a comment; with a semicolon
SELECT @it_mark AS mark, "x;y" AS text # another; comment
;`
    const results = []
    for (const statement of splitStatements(script, mysqlEngine.dialect.lexical)) {
      results.push(await run(statement.text))
    }

    expect(results.at(-1)?.rows).toStrictEqual([['a;b', 'x;y']])
  })
})
