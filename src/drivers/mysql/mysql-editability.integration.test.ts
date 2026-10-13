import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { editabilityOf, query, type Server } from '../../../test/integration/edits.ts'
import { connectRequest, MYSQL, waitUntilReady } from '../../../test/integration/servers.ts'
import { ShapeProblem } from '../../core/edits/select-shape.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { mysqlEngine } from './mysql-engine.ts'

const ODD = '`it_editability odd``"name`'
const SETUP = [
  'DROP VIEW IF EXISTS it_editability_line_view',
  `DROP TABLE IF EXISTS ${ODD}, it_editability_lines, it_editability_loose,
    it_editability_myisam, it_editability_coded, it_editability_maybe_coded,
    it_editability_hidden`,
  `CREATE TABLE ${ODD} (Id bigint unsigned PRIMARY KEY, \`select\` text)`,
  `CREATE TABLE it_editability_lines (
    order_id int, line_no int, qty int NOT NULL, note text, PRIMARY KEY (order_id, line_no))`,
  'CREATE VIEW it_editability_line_view AS SELECT * FROM it_editability_lines',
  'CREATE TABLE it_editability_loose (a int, b text)',
  'CREATE TABLE it_editability_myisam (id int PRIMARY KEY) ENGINE=MyISAM',
  'CREATE TABLE it_editability_coded (code varchar(10) NOT NULL UNIQUE, qty int)',
  'CREATE TABLE it_editability_maybe_coded (code varchar(10) UNIQUE, qty int)',
  // SELECT * does not show an INVISIBLE column, which an INSERT then cannot give a value.
  'CREATE TABLE it_editability_hidden (id int PRIMARY KEY, secret int NOT NULL INVISIBLE)',
]

let session: EngineSession
let server: Server

describe('which results of a real MySQL server the grid edits', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      session = await mysqlEngine.connect(connectRequest(MYSQL))
    })
    for (const statement of SETUP) {
      await query(session, statement)
    }
    server = { engine: mysqlEngine, session, database: MYSQL.database }
  })

  afterAll(async () => {
    await session.close()
  })

  it.each([
    [`SELECT * FROM ${ODD}`, { name: ['sqldoro', 'it_editability odd`"name'], key: [0] }],
    [`SELECT \`select\`, Id FROM sqldoro.${ODD}`, { key: [1] }],
    [
      'SELECT * FROM it_editability_lines WHERE qty > 0 ORDER BY order_id LIMIT 10',
      { label: 'sqldoro.it_editability_lines', key: [0, 1] },
    ],
    ['SELECT qty, code FROM it_editability_coded', { key: [1] }],
    [
      'SELECT * FROM it_editability_hidden',
      { insertProblem: 'Adding rows needs a value for secret: add it to the query, once.' },
    ],
  ])('should edit the rows of %s', async (sql, table) => {
    await expect(editabilityOf(server, sql)).resolves.toMatchObject({ table })
  })

  it.each([
    [
      'SELECT * FROM it_editability_line_view',
      'The rows come from a view: sqldoro only edits the rows of tables.',
    ],
    [
      'SELECT l.qty FROM it_editability_lines l JOIN it_editability_coded c ON c.qty = l.qty',
      ShapeProblem.Join,
    ],
    ['SELECT order_id, COUNT(*) FROM it_editability_lines GROUP BY order_id', ShapeProblem.Grouped],
    ['SELECT * FROM (SELECT * FROM it_editability_lines) s', ShapeProblem.Subquery],
    ['SELECT DISTINCT * FROM it_editability_lines', ShapeProblem.Distinct],
    [
      'SELECT order_id, line_no, qty + 1 FROM it_editability_lines',
      'Column 3 of the query is an expression, not a column of the table: only queries that select plain columns can be edited.',
    ],
    [
      'SELECT qty, note FROM it_editability_lines',
      'The result does not include the primary key of sqldoro.it_editability_lines (order_id, line_no) or another unique key without NULLs that sqldoro can compare: add it to the query to edit rows.',
    ],
    [
      'SELECT * FROM it_editability_loose',
      'sqldoro.it_editability_loose has no primary key and no unique key without NULLs: sqldoro cannot tell its rows apart.',
    ],
    [
      'SELECT * FROM it_editability_maybe_coded',
      'sqldoro.it_editability_maybe_coded has no primary key and no unique key without NULLs: sqldoro cannot tell its rows apart.',
    ],
    [
      'SELECT * FROM it_editability_myisam',
      '"it_editability_myisam" uses the MyISAM storage engine, which cannot roll changes back: sqldoro does not edit it.',
    ],
  ])('should not edit the rows of %s', async (sql, problem) => {
    await expect(editabilityOf(server, sql)).resolves.toStrictEqual({ problem })
  })
})
