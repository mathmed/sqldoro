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
import { connectRequest, POSTGRES, waitUntilReady } from '../../../test/integration/servers.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import { OutcomeKind } from '../../core/edits/outcome.ts'
import { EditVerb } from '../../core/edits/statements.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { classifyStatement } from '../../core/safety/classify.ts'
import { isHarmless } from '../../core/safety/statement-class.ts'
import { postgresEngine } from './postgres-engine.ts'

const SCHEMA = 'it_edits'
const SCOPE = { database: POSTGRES.database, schema: SCHEMA }
// A table of every type the grid edits, under a name that needs quoting.
const ODD = '"odd ""name"""'
const ODD_QUERY = `SELECT * FROM ${ODD} ORDER BY "Id"`
const LINES_QUERY = 'SELECT * FROM lines ORDER BY order_id, line_no'
const MAX_ID = '9223372036854775807'
const MIN_ID = '-9223372036854775808'
const DONE = { kind: OutcomeKind.Done, problem: '' }
const READ_ONLY_ERROR = /read-only transaction/
// Columns of the odd table, by position in SELECT *.
const Odd = {
  Id: 0,
  Select: 1,
  Price: 2,
  Doc: 3,
  Raw: 4,
  Flag: 5,
  Day: 6,
  At: 7,
  LocalAt: 8,
  Mood: 9,
  Uid: 10,
  Ratio: 11,
  Note: 12,
} as const
// What the odd table holds once every type was typed in, as the observer reads it back.
const TYPED_ROW = [
  'O\'Reilly "x" \\ $1 ?\nnew line',
  '-98765432109876543210.9876543210',
  '{"k": "v\'s", "n": 12345678901234567890}',
  '[1,  2]',
  false,
  '2000-01-01',
  true,
  '1999-12-31 23:59:59.999999',
  'sad',
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  2.5,
  'twelve chars',
]
const SETUP = [
  `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`,
  `CREATE SCHEMA ${SCHEMA}`,
  `CREATE TYPE ${SCHEMA}.mood AS ENUM ('sad', 'ok', 'it''s')`,
  `CREATE TABLE ${SCHEMA}.${ODD} (
    "Id" bigint PRIMARY KEY, "select" text, "Price ""usd""" numeric(30,10), doc jsonb, raw json,
    flag boolean, day date, at timestamptz, local_at timestamp, mood ${SCHEMA}.mood, uid uuid,
    ratio double precision, note varchar(20) NOT NULL DEFAULT 'none')`,
  `INSERT INTO ${SCHEMA}.${ODD} VALUES
    (${MAX_ID}, 'it''s "quoted" \\ back', 12345678901234567890.0123456789,
     '{"a": [1, 2, {"b": null}]}', '{"z":1,  "a":2}', true, '2024-02-29', '2024-03-31 01:30:00+00',
     '2024-03-31 02:30:00', 'it''s', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 0.1, 'n1'),
    (${MIN_ID}, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'n2'),
    (3, '; DROP TABLE ${SCHEMA}.lines; --', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     NULL, 'n3')`,
  `CREATE TABLE ${SCHEMA}.lines (
    order_id int, line_no int, qty int NOT NULL, note text, PRIMARY KEY (order_id, line_no))`,
  `INSERT INTO ${SCHEMA}.lines VALUES (1, 1, 5, 'a'), (1, 2, 7, NULL), (2, 1, 1, 'c')`,
  `CREATE TABLE ${SCHEMA}.seq (
    id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, qty int,
    twice int GENERATED ALWAYS AS (qty * 2) STORED)`,
]

let writable: EngineSession
let readOnly: EngineSession
let observer: EngineSession
let server: Server

async function oddRow(id: string): Promise<unknown> {
  return firstRow(
    observer,
    `SELECT "select", "Price ""usd"""::text, doc::text, raw::text, flag, day::text,
      at = '2024-06-01 10:00:00+00', local_at::text, mood::text, uid::text, ratio, note
    FROM ${ODD} WHERE "Id" = $1`,
    [id],
  )
}

async function lines(): Promise<unknown> {
  const result = await query(observer, LINES_QUERY)
  return result.rows
}

describe('the edits of the grid, against a real PostgreSQL server', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      writable = await postgresEngine.connect(connectRequest(POSTGRES))
    })
    for (const statement of SETUP) {
      await query(writable, statement)
    }
    await writable.useScope(SCOPE)
    readOnly = await postgresEngine.connect(connectRequest(POSTGRES, { isReadOnly: true }))
    await readOnly.useScope(SCOPE)
    observer = await postgresEngine.connect(connectRequest(POSTGRES))
    await observer.useScope(SCOPE)
    server = { engine: postgresEngine, session: writable, database: POSTGRES.database }
  })

  afterAll(async () => {
    await Promise.all([writable.close(), readOnly.close(), observer.close()])
  })

  describe('statements', () => {
    it('should write every type exactly as typed, under names that need quoting', async () => {
      const { plan, outcomes } = await applied(server, ODD_QUERY, [
        typed(2, Odd.Select, 'O\'Reilly "x" \\ $1 ?\nnew line'),
        typed(2, Odd.Price, '-98765432109876543210.9876543210'),
        typed(2, Odd.Doc, '{"n": 12345678901234567890, "k": "v\'s"}'),
        typed(2, Odd.Raw, '[1,  2]'),
        typed(2, Odd.Flag, 'false'),
        typed(2, Odd.Day, '2000-01-01'),
        typed(2, Odd.At, '2024-06-01 12:00:00+02'),
        typed(2, Odd.LocalAt, '1999-12-31 23:59:59.999999'),
        typed(2, Odd.Mood, 'sad'),
        typed(2, Odd.Uid, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12'),
        typed(2, Odd.Ratio, '2.5'),
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
        typed(0, Odd.Price, '0.0000000001'),
        onCell(EditKind.SetNull, 1, Odd.Select),
        onCell(EditKind.SetDefault, 1, Odd.Note),
      ])

      expect(plan.statements.at(0)?.sql).toContain('"select" IS NULL')
      expect(outcomes).toStrictEqual([DONE, DONE])
      await expect(
        firstRow(
          observer,
          `SELECT "select", doc IS NULL, doc::text, "Price ""usd"""::text FROM ${ODD} WHERE "Id" = $1`,
          [MIN_ID],
        ),
      ).resolves.toStrictEqual(['was null', false, 'null', '0.0000000001'])
      await expect(
        firstRow(observer, `SELECT "select", note FROM ${ODD} WHERE "Id" = 3`),
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
        firstRow(observer, `SELECT doc::text, note, "select" FROM ${ODD} WHERE "Id" = 42`),
      ).resolves.toStrictEqual(['{"new": true}', 'none', null])
      await expect(oddRow('43')).resolves.toStrictEqual(TYPED_ROW)
      await expect(oddRow(MAX_ID)).resolves.toBeUndefined()
    })

    it('should leave identity and generated columns to the server', async () => {
      const rows = await editableRows(server, 'SELECT * FROM seq')
      expect(rows.table.columns.map(({ value }) => value.type)).toStrictEqual([
        'readOnly',
        'integer',
        'readOnly',
      ])

      const { outcomes } = await applied(server, 'SELECT * FROM seq', [
        NEW_ROW,
        typedInNew(1, 1, '5'),
      ])

      expect(outcomes).toStrictEqual([DONE])
      await expect(firstRow(observer, 'SELECT id, qty, twice FROM seq')).resolves.toStrictEqual([
        1, 5, 10,
      ])
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
    it('should change no row that changed or went since it was read', async () => {
      const rows = await editableRows(server, LINES_QUERY)
      await query(observer, 'UPDATE lines SET qty = 99 WHERE order_id = 1 AND line_no = 1')
      await query(observer, 'DELETE FROM lines WHERE order_id = 1 AND line_no = 2')

      const plan = planned(
        rows,
        edited(rows, [typed(0, 2, '6'), onCell(EditKind.Delete, 1)]),
        server,
      )
      const outcomes = await runPlan(writable, plan)

      expect(outcomes.map(({ kind }) => kind)).toStrictEqual([
        OutcomeKind.Conflict,
        OutcomeKind.Conflict,
      ])
      await expect(lines()).resolves.toStrictEqual([[1, 1, 99, 'a']])
    })
  })

  describe('a read-only session, with the statement checks bypassed', () => {
    it('should refuse every statement of the grid on the server', async () => {
      await query(writable, "INSERT INTO lines VALUES (5, 1, 1, 'x')")
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
        expect(isHarmless(classifyStatement(sql, postgresEngine.dialect))).toBe(false)
      }

      const outcomes = await runPlan(readOnly, plan)

      expect(outcomes.map(({ kind }) => kind)).toStrictEqual(['failed', 'failed', 'failed'])
      for (const { problem } of outcomes) {
        expect(problem).toMatch(READ_ONLY_ERROR)
      }
      await expect(lines()).resolves.toStrictEqual([
        [1, 1, 99, 'a'],
        [5, 1, 1, 'x'],
      ])
    })
  })
})
