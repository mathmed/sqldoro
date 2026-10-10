import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { editabilityOf, query, type Server } from '../../../test/integration/edits.ts'
import { connectRequest, POSTGRES, waitUntilReady } from '../../../test/integration/servers.ts'
import { ShapeProblem } from '../../core/edits/select-shape.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { postgresEngine } from './postgres-engine.ts'

const SCHEMA = 'it_editability'
const SETUP = [
  `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`,
  `CREATE SCHEMA ${SCHEMA}`,
  `CREATE TABLE ${SCHEMA}."odd ""name""" ("Id" bigint PRIMARY KEY, "select" text)`,
  `CREATE TABLE ${SCHEMA}.lines (
    order_id int, line_no int, qty int NOT NULL, note text, PRIMARY KEY (order_id, line_no))`,
  `CREATE VIEW ${SCHEMA}.line_view AS SELECT * FROM ${SCHEMA}.lines`,
  `CREATE MATERIALIZED VIEW ${SCHEMA}.line_totals AS SELECT order_id, line_no FROM ${SCHEMA}.lines`,
  `CREATE TABLE ${SCHEMA}.loose (a int, b text)`,
  `CREATE TABLE ${SCHEMA}.coded (code text NOT NULL UNIQUE, qty int)`,
  `CREATE TABLE ${SCHEMA}.maybe_coded (code text UNIQUE, qty int)`,
  `CREATE TABLE ${SCHEMA}.parent (id int PRIMARY KEY)`,
  `CREATE TABLE ${SCHEMA}.child (extra int) INHERITS (${SCHEMA}.parent)`,
  `CREATE TABLE ${SCHEMA}.measures (id int, day date, PRIMARY KEY (id, day)) PARTITION BY RANGE (day)`,
  `CREATE TABLE ${SCHEMA}.measures_2026 PARTITION OF ${SCHEMA}.measures
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01')`,
]

let session: EngineSession
let server: Server

describe('which results of a real PostgreSQL server the grid edits', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await postgresEngine.connect(connectRequest(POSTGRES))
    })
    for (const statement of SETUP) {
      await query(session, statement)
    }
    await session.useScope({ database: POSTGRES.database, schema: SCHEMA })
    server = { engine: postgresEngine, session, database: POSTGRES.database }
  })

  afterAll(async () => {
    await session.close()
  })

  it.each([
    ['SELECT * FROM "odd ""name"""', { name: [SCHEMA, 'odd "name"'], key: [0] }],
    ['SELECT "select", "Id" FROM it_editability."odd ""name"""', { key: [1] }],
    ['SELECT * FROM lines WHERE qty > 0 ORDER BY order_id LIMIT 10', { key: [0, 1] }],
    ['SELECT qty, code FROM coded', { label: 'it_editability.coded', key: [1] }],
    ['SELECT * FROM measures', { label: 'it_editability.measures', key: [0, 1] }],
  ])('should edit the rows of %s', async (sql, table) => {
    await expect(editabilityOf(server, sql)).resolves.toMatchObject({ table })
  })

  it.each([
    [
      'SELECT * FROM line_view',
      'The rows come from a view: sqldoro only edits the rows of tables.',
    ],
    [
      'SELECT * FROM line_totals',
      'The rows come from a materialized view, which cannot be edited.',
    ],
    ['SELECT l.qty FROM lines l JOIN lines m ON m.order_id = l.order_id', ShapeProblem.Join],
    ['SELECT l.* FROM lines l, coded c', ShapeProblem.Join],
    ['SELECT order_id, COUNT(*) FROM lines GROUP BY order_id', ShapeProblem.Grouped],
    ['SELECT * FROM (SELECT * FROM lines) s', ShapeProblem.Subquery],
    ['WITH s AS (SELECT * FROM lines) SELECT * FROM s', ShapeProblem.NotASelect],
    ['SELECT DISTINCT * FROM lines', ShapeProblem.Distinct],
    ['SELECT * FROM lines UNION ALL SELECT * FROM lines', ShapeProblem.Combined],
    [
      'SELECT order_id, line_no, qty + 1 FROM lines',
      'Column 3 of the query is an expression, not a column of the table: only queries that select plain columns can be edited.',
    ],
    [
      'SELECT qty, note FROM lines',
      'The result does not include the primary key of it_editability.lines (order_id, line_no) or another unique key without NULLs that sqldoro can compare: add it to the query to edit rows.',
    ],
    [
      'SELECT * FROM loose',
      'it_editability.loose has no primary key and no unique key without NULLs: sqldoro cannot tell its rows apart.',
    ],
    [
      'SELECT * FROM maybe_coded',
      'it_editability.maybe_coded has no primary key and no unique key without NULLs: sqldoro cannot tell its rows apart.',
    ],
    [
      'SELECT * FROM parent',
      'Other tables inherit from "parent": their rows show in it, and their keys may repeat. sqldoro does not edit it.',
    ],
  ])('should not edit the rows of %s', async (sql, problem) => {
    await expect(editabilityOf(server, sql)).resolves.toStrictEqual({ problem })
  })
})
