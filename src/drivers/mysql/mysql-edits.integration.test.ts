import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  applied,
  editableRows,
  edited,
  firstRow,
  NEW_ROW,
  onCell,
  planned,
  query,
  runPlan,
  type Server,
  typed,
  typedInNew,
} from '../../../test/integration/edits.ts'
import { connectRequest, MYSQL, waitUntilReady } from '../../../test/integration/servers.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import { OutcomeKind } from '../../core/edits/outcome.ts'
import { EditVerb } from '../../core/edits/statements.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { classifyStatement } from '../../core/safety/classify.ts'
import { isHarmless } from '../../core/safety/statement-class.ts'
import { mysqlEngine } from './mysql-engine.ts'

// A table of every type the grid edits, under a name that needs quoting.
const ODD = '`it_edits odd``"name`'
const ODD_QUERY = `SELECT * FROM ${ODD} ORDER BY Id`
const LINES_QUERY = 'SELECT * FROM it_edits_lines ORDER BY order_id, line_no'
const MAX_ID = '18446744073709551615'
const DONE = { kind: OutcomeKind.Done, problem: '' }
const READ_ONLY_ERROR = /READ ONLY transaction/
// Columns of the odd table, by position in SELECT *.
const Odd = {
  Id: 0,
  Select: 1,
  Price: 2,
  Doc: 3,
  Flag: 4,
  Day: 5,
  At: 6,
  Ts: 7,
  Clock: 8,
  Year: 9,
  Mood: 10,
  Tags: 11,
  Ratio: 12,
  Single: 13,
  Legacy: 14,
  Bin: 15,
  Note: 16,
} as const
const PRICE = '-98765432109876543210987654321098765.987654321098765432109876543210'
// What the odd table holds once every type was typed in, as the observer reads it back.
const TYPED_ROW = [
  'O\'Reilly "x" \\ ? $1\nnew line',
  PRICE,
  '{"k": "v\'s", "n": 12345678901234567890}',
  0,
  '1000-01-01',
  '9999-12-31 23:59:59.999999',
  '2000-06-01 12:00:00.500',
  '838:59:59',
  1901,
  'sad',
  'a,b',
  2e-3,
  0.25,
  'Ñandú',
  'twelve chars',
]
const SETUP = [
  `DROP TABLE IF EXISTS ${ODD}, it_edits_lines, it_edits_seq, it_edits_coded`,
  `CREATE TABLE ${ODD} (
    Id bigint unsigned PRIMARY KEY, \`select\` varchar(100), \`Price "usd"\` decimal(65,30),
    doc json, flag tinyint(1), day date, at datetime(6), ts timestamp(3) NULL, clock time,
    yr year, mood enum('sad','ok','it''s'), tags set('a','b','c'), ratio double, single float,
    legacy varchar(20) CHARACTER SET latin1, bin varbinary(8),
    note varchar(20) NOT NULL DEFAULT 'none') ENGINE=InnoDB`,
  `INSERT INTO ${ODD} VALUES
    (${MAX_ID}, 'it''s "quoted" \\\\ back',
     12345678901234567890123456789012345.123456789012345678901234567890,
     '{"a": [1, 2, {"b": null}]}', 1, '2024-02-29', '2024-03-31 01:30:00.123456',
     '2024-03-31 01:30:00.123', '-838:59:59', 2155, 'it''s', 'a,c', 0.1, 0.1, 'café',
     x'DEADBEEF', 'n1'),
    (0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'n2'),
    (3, '; DROP TABLE it_edits_lines; --', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     NULL, NULL, NULL, NULL, NULL, 'n3')`,
  `CREATE TABLE it_edits_lines (
    order_id int, line_no int, qty int NOT NULL, note text, PRIMARY KEY (order_id, line_no))`,
  `INSERT INTO it_edits_lines VALUES (1, 1, 5, 'a'), (1, 2, 7, NULL), (2, 1, 1, 'c')`,
  `CREATE TABLE it_edits_coded (code varchar(10) NOT NULL UNIQUE, amount decimal(5,2))`,
  "INSERT INTO it_edits_coded VALUES ('X', 1.50)",
  `CREATE TABLE it_edits_seq (
    id int AUTO_INCREMENT PRIMARY KEY, qty int, twice int GENERATED ALWAYS AS (qty * 2) STORED)`,
]

let writable: EngineSession
let readOnly: EngineSession
let observer: EngineSession
let server: Server

async function oddRow(id: string): Promise<unknown> {
  return firstRow(
    observer,
    `SELECT \`select\`, CAST(\`Price "usd"\` AS CHAR), CAST(doc AS CHAR), flag, day, at, ts, clock,
      yr, mood, tags, ratio, single, legacy, note
    FROM ${ODD} WHERE Id = CAST(? AS DECIMAL(20,0))`,
    [id],
  )
}

async function lines(): Promise<unknown> {
  const result = await query(observer, LINES_QUERY)
  return result.rows
}

describe('the edits of the grid, against a real MySQL server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      writable = await mysqlEngine.connect(connectRequest(MYSQL))
    })
    for (const statement of SETUP) {
      await query(writable, statement)
    }
    readOnly = await mysqlEngine.connect(connectRequest(MYSQL, { isReadOnly: true }))
    observer = await mysqlEngine.connect(connectRequest(MYSQL))
    server = { engine: mysqlEngine, session: writable, database: MYSQL.database }
  })

  afterAll(async () => {
    await Promise.all([writable.close(), readOnly.close(), observer.close()])
  })

  describe('statements', () => {
    it('should write every type exactly as typed, under names that need quoting', async () => {
      const { plan, outcomes } = await applied(server, ODD_QUERY, [
        typed(2, Odd.Select, 'O\'Reilly "x" \\ ? $1\nnew line'),
        typed(2, Odd.Price, PRICE),
        typed(2, Odd.Doc, '{"n": 12345678901234567890, "k": "v\'s"}'),
        typed(2, Odd.Flag, '0'),
        typed(2, Odd.Day, '1000-01-01'),
        typed(2, Odd.At, '9999-12-31 23:59:59.999999'),
        typed(2, Odd.Ts, '2000-06-01 12:00:00.5'),
        typed(2, Odd.Clock, '838:59:59'),
        typed(2, Odd.Year, '1901'),
        typed(2, Odd.Mood, 'sad'),
        typed(2, Odd.Tags, 'a,b'),
        typed(2, Odd.Ratio, '2e-3'),
        typed(2, Odd.Single, '0.25'),
        typed(2, Odd.Legacy, 'Ñandú'),
        typed(2, Odd.Note, 'twelve chars'),
      ])

      expect(plan.statements.map(({ verb }) => verb)).toStrictEqual([EditVerb.Update])
      expect(outcomes).toStrictEqual([DONE])
      await expect(oddRow(MAX_ID)).resolves.toStrictEqual(TYPED_ROW)
    })

    it('should find rows whose values were NULL, and write NULL, JSON null and defaults', async () => {
      const { plan, outcomes } = await applied(server, ODD_QUERY, [
        typed(0, Odd.Select, 'was null'),
        typed(0, Odd.Doc, 'null'),
        typed(0, Odd.Price, '0.000000000000000000000000000001'),
        onCell(EditKind.SetNull, 1, Odd.Select),
        onCell(EditKind.SetDefault, 1, Odd.Note),
      ])

      expect(plan.statements.at(0)?.sql).toContain('`select` IS NULL')
      expect(outcomes).toStrictEqual([DONE, DONE])
      await expect(
        firstRow(
          observer,
          `SELECT \`select\`, doc IS NULL, CAST(doc AS CHAR), CAST(\`Price "usd"\` AS CHAR) FROM ${ODD} WHERE Id = 0`,
        ),
      ).resolves.toStrictEqual(['was null', '0', 'null', '0.000000000000000000000000000001'])
      await expect(
        firstRow(observer, `SELECT \`select\`, note FROM ${ODD} WHERE Id = 3`),
      ).resolves.toStrictEqual([null, 'none'])
    })

    it('should add rows, from defaults or as copies, and delete rows by every value they hold', async () => {
      const { plan, outcomes } = await applied(server, ODD_QUERY, [
        NEW_ROW,
        typedInNew(1, Odd.Id, '42'),
        typedInNew(1, Odd.Doc, '{"new": true}'),
        onCell(EditKind.Duplicate, 2),
        typedInNew(2, Odd.Id, '43'),
        onCell(EditKind.Delete, 2),
      ])

      expect(plan.statements.map(({ verb }) => verb)).toStrictEqual([
        EditVerb.Delete,
        EditVerb.Insert,
        EditVerb.Insert,
      ])
      expect(outcomes).toStrictEqual([DONE, DONE, DONE])
      await expect(
        firstRow(
          observer,
          `SELECT CAST(doc AS CHAR), note, \`select\`, bin FROM ${ODD} WHERE Id = 42`,
        ),
      ).resolves.toStrictEqual(['{"new": true}', 'none', null, null])
      await expect(oddRow('43')).resolves.toStrictEqual(TYPED_ROW)
      await expect(oddRow(MAX_ID)).resolves.toBeUndefined()
    })

    it('should leave auto-increment keys and generated columns to the server', async () => {
      const rows = await editableRows(server, 'SELECT * FROM it_edits_seq')
      expect(rows.table.columns.map(({ value }) => value.type)).toStrictEqual([
        'integer',
        'integer',
        'readOnly',
      ])

      const { outcomes } = await applied(server, 'SELECT * FROM it_edits_seq', [
        NEW_ROW,
        typedInNew(1, 1, '5'),
      ])

      expect(outcomes).toStrictEqual([DONE])
      await expect(
        firstRow(observer, 'SELECT id, qty, twice FROM it_edits_seq'),
      ).resolves.toStrictEqual([1, 5, 10])
    })

    it('should count a row it found as changed, even when its value stays the same', async () => {
      const { outcomes } = await applied(server, 'SELECT * FROM it_edits_coded', [
        typed(0, 1, '1.5'),
      ])

      expect(outcomes).toStrictEqual([DONE])
    })

    it('should change and delete rows by a composite primary key', async () => {
      const { outcomes } = await applied(server, LINES_QUERY, [
        typed(1, 2, '8'),
        onCell(EditKind.Delete, 2),
      ])

      expect(outcomes).toStrictEqual([DONE, DONE])
      await expect(lines()).resolves.toStrictEqual([
        [1, 1, 5, 'a'],
        [1, 2, 8, null],
      ])
    })
  })

  describe('conflicts', () => {
    it('should change no row that changed or went since it was read, even in case only', async () => {
      const rows = await editableRows(server, LINES_QUERY)
      await query(
        observer,
        "UPDATE it_edits_lines SET note = 'A' WHERE order_id = 1 AND line_no = 1",
      )
      await query(observer, 'DELETE FROM it_edits_lines WHERE order_id = 1 AND line_no = 2')

      const plan = planned(
        rows,
        edited(rows, [typed(0, 3, 'b'), onCell(EditKind.Delete, 1)]),
        server,
      )
      const outcomes = await runPlan(writable, plan)

      expect(outcomes.map(({ kind }) => kind)).toStrictEqual([
        OutcomeKind.Conflict,
        OutcomeKind.Conflict,
      ])
      await expect(lines()).resolves.toStrictEqual([[1, 1, 5, 'A']])
    })
  })

  describe('a read-only session, with the statement checks bypassed', () => {
    it('should refuse every statement of the grid on the server', async () => {
      await query(writable, "INSERT INTO it_edits_lines VALUES (5, 1, 1, 'x')")
      const rows = await editableRows(server, LINES_QUERY)
      const plan = planned(
        rows,
        edited(rows, [
          typed(0, 2, '7'),
          onCell(EditKind.Delete, 1),
          NEW_ROW,
          typedInNew(1, 0, '6'),
          typedInNew(1, 1, '1'),
          typedInNew(1, 2, '1'),
        ]),
        server,
      )
      for (const { sql } of plan.statements) {
        expect(isHarmless(classifyStatement(sql, mysqlEngine.dialect))).toBe(false)
      }

      const outcomes = await runPlan(readOnly, plan)

      expect(outcomes.map(({ kind }) => kind)).toStrictEqual(['failed', 'failed', 'failed'])
      for (const { problem } of outcomes) {
        expect(problem).toMatch(READ_ONLY_ERROR)
      }
      await expect(lines()).resolves.toStrictEqual([
        [1, 1, 5, 'A'],
        [5, 1, 1, 'x'],
      ])
    })
  })
})
