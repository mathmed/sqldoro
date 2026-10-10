// The edits of the grid applied by the extension host, wired as in VS Code, on real servers: the
// guards, the transaction of the apply, its outcome per row and the rows read again.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  cell,
  closeGrid,
  CONNECTION_NAME,
  edit,
  editingOf,
  type EditorTarget,
  type GridEditor,
  openGrid,
  previewAndApply,
  tabRows,
} from '../../../test/integration/editor.ts'
import { query } from '../../../test/integration/edits.ts'
import {
  connectRequest,
  MYSQL,
  POSTGRES,
  waitUntilReady,
} from '../../../test/integration/servers.ts'
import { answerInputs } from '../../../test/support/prompts.ts'
import { resetVscode, settings, webviewPanels, window } from '../../../test/vscode.ts'
import { EnvironmentTag } from '../../core/connection/connection.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { createEngineRegistry } from '../factories/engines.ts'

interface Case extends EditorTarget {
  readonly name: string
  readonly table: string
  readonly label: string
  readonly setup: readonly string[]
  readonly duplicate: RegExp
}

const CASES: readonly Case[] = [
  {
    name: 'PostgreSQL',
    engineId: 'postgres',
    server: POSTGRES,
    schema: 'it_apply',
    sql: 'SELECT * FROM orders ORDER BY id',
    table: 'it_apply.orders',
    label: 'it_apply.orders',
    setup: [
      'DROP SCHEMA IF EXISTS it_apply CASCADE',
      'CREATE SCHEMA it_apply',
      'CREATE TABLE it_apply.orders (id int PRIMARY KEY, code text NOT NULL UNIQUE, note text)',
    ],
    duplicate: /duplicate key value violates unique constraint/,
  },
  {
    name: 'MySQL',
    engineId: 'mysql',
    server: MYSQL,
    schema: '',
    sql: 'SELECT * FROM it_apply_orders ORDER BY id',
    table: 'it_apply_orders',
    label: 'sqldoro.it_apply_orders',
    setup: [
      'DROP TABLE IF EXISTS it_apply_orders',
      `CREATE TABLE it_apply_orders (
        id int PRIMARY KEY, code varchar(10) NOT NULL UNIQUE, note text) ENGINE=InnoDB`,
    ],
    duplicate: /Duplicate entry/,
  },
]
const SEEDED = [
  [1, 'A', 'first'],
  [2, 'B', 'second'],
  [3, 'C', null],
]
const FIRST_TWO_ROWS = { firstRow: 0, lastRow: 1, firstColumn: 0, lastColumn: 0 }

describe.each(CASES)('the edits of the grid applied on a real $name server', (target) => {
  let observer: EngineSession
  let editor: GridEditor | undefined

  async function rows(session = observer): Promise<unknown> {
    const result = await query(session, `SELECT id, code, note FROM ${target.table} ORDER BY id`)
    return result.rows
  }

  // A row added in the grid, after the three rows of the result.
  function addRow(grid: GridEditor, id: string, code: string): void {
    edit(grid, { kind: EditKind.Insert, range: null })
    edit(grid, { kind: EditKind.Set, range: cell(3, 0), input: id })
    edit(grid, { kind: EditKind.Set, range: cell(3, 1), input: code })
  }

  async function editorSession(grid: GridEditor): Promise<EngineSession | undefined> {
    const session = await grid.query.editorSessions.existing(grid.uri.toString())
    return session?.engineSession
  }

  beforeAll(async () => {
    const engine = createEngineRegistry().get(target.engineId)
    await waitUntilReady(async () => {
      observer = await engine.connect(connectRequest(target.server))
    })
    for (const statement of target.setup) {
      await query(observer, statement)
    }
  })

  beforeEach(async () => {
    resetVscode()
    webviewPanels.length = 0
    await query(observer, `DELETE FROM ${target.table}`)
    await query(
      observer,
      `INSERT INTO ${target.table} VALUES (1, 'A', 'first'), (2, 'B', 'second'), (3, 'C', NULL)`,
    )
  })

  afterEach(async () => {
    if (editor !== undefined) {
      await closeGrid(editor)
    }
    editor = undefined
  })

  afterAll(async () => {
    await observer.close()
  })

  it('should apply the changes in one transaction, then read the rows again', async () => {
    editor = await openGrid(target)
    window.showWarningMessage.mockResolvedValue('Delete 1 Row')
    edit(editor, { kind: EditKind.Set, range: cell(0, 2), input: 'changed' })
    addRow(editor, '4', 'D')
    edit(editor, { kind: EditKind.Delete, range: cell(2, 0) })

    const editing = await previewAndApply(editor)

    expect(editing).toMatchObject({
      notice: `Applied 1 update, 1 insertion and 1 deletion on ${target.label}.`,
      isNoticeError: false,
      rows: [],
    })
    expect(window.showWarningMessage).toHaveBeenCalledOnce()
    const applied = [
      [1, 'A', 'changed'],
      [2, 'B', 'second'],
      [4, 'D', null],
    ]
    await expect(rows()).resolves.toStrictEqual(applied)
    expect(tabRows(editor)).toStrictEqual(applied)
  })

  it('should apply nothing when a statement fails, and say which', async () => {
    editor = await openGrid(target)
    edit(editor, { kind: EditKind.Set, range: cell(0, 2), input: 'changed' })
    addRow(editor, '2', 'Z')

    const editing = await previewAndApply(editor)

    expect(editing.isNoticeError).toBe(true)
    expect(editing.notice).toMatch(/^Nothing was applied: new row 1: /)
    expect(editing.notice).toMatch(target.duplicate)
    expect(window.showErrorMessage).toHaveBeenCalledWith(editing.notice)
    await expect(rows()).resolves.toStrictEqual(SEEDED)
  })

  it('should report every row that changed meanwhile, and overwrite none', async () => {
    editor = await openGrid(target)
    edit(editor, { kind: EditKind.Set, range: cell(0, 2), input: 'mine' })
    edit(editor, { kind: EditKind.Set, range: cell(1, 2), input: 'mine too' })
    await query(observer, `UPDATE ${target.table} SET note = 'theirs' WHERE id IN (1, 2)`)

    const editing = await previewAndApply(editor)

    expect(editing.notice).toBe(
      'Nothing was applied: id = 1 changed or was deleted since sqldoro read it: it was not overwritten. (1 more row did not apply either.)',
    )
    expect(editing.rows.map(({ row, problem }) => [row, problem])).toStrictEqual([
      [0, 'id = 1 changed or was deleted since sqldoro read it: it was not overwritten.'],
      [1, 'id = 2 changed or was deleted since sqldoro read it: it was not overwritten.'],
    ])
    await expect(rows()).resolves.toStrictEqual([
      [1, 'A', 'theirs'],
      [2, 'B', 'theirs'],
      [3, 'C', null],
    ])
  })

  it('should ask for the name of a production connection, then the number of rows to delete', async () => {
    editor = await openGrid(target, { environment: EnvironmentTag.Production })
    edit(editor, { kind: EditKind.Delete, range: FIRST_TWO_ROWS })

    answerInputs(undefined)
    const declined = await previewAndApply(editor)
    expect(declined.notice).toBe('Nothing was applied: the changes did not run.')
    await expect(rows()).resolves.toStrictEqual(SEEDED)

    answerInputs(CONNECTION_NAME, undefined)
    const notConfirmed = await previewAndApply(editor)
    expect(notConfirmed.notice).toBe('Nothing was applied: the deletion was not confirmed.')
    await expect(rows()).resolves.toStrictEqual(SEEDED)

    answerInputs(CONNECTION_NAME, '2')
    const applied = await previewAndApply(editor)
    expect(applied.notice).toBe(`Applied 2 deletions on ${target.label}.`)
    await expect(rows()).resolves.toStrictEqual([[3, 'C', null]])
  })

  it('should join the open transaction of the editor, inside a savepoint', async () => {
    settings.set('sqldoro.transactions.defaultMode', 'manual')
    editor = await openGrid(target)
    edit(editor, { kind: EditKind.Set, range: cell(0, 2), input: 'pending' })

    const joined = await previewAndApply(editor)
    expect(joined.notice).toBe(
      `Applied 1 update on ${target.label}. The changes are in the open transaction of this editor: commit it to keep them.`,
    )
    await expect(rows()).resolves.toStrictEqual(SEEDED)

    edit(editor, { kind: EditKind.Set, range: cell(1, 2), input: 'lost' })
    addRow(editor, '1', 'Z')
    const failed = await previewAndApply(editor)
    expect(failed.notice).toMatch(target.duplicate)

    const session = await editorSession(editor)
    await expect(session?.transactionStatus()).resolves.toBe(TransactionStatus.Open)
    await expect(rows(session)).resolves.toStrictEqual([
      [1, 'A', 'pending'],
      [2, 'B', 'second'],
      [3, 'C', null],
    ])
    await expect(rows()).resolves.toStrictEqual(SEEDED)
  })

  it('should not edit the rows of a read-only connection', async () => {
    editor = await openGrid(target, { isReadOnly: true })

    edit(editor, { kind: EditKind.Set, range: cell(0, 2), input: 'changed' })
    editor.panel.webview.send({ type: 'previewEdits', tabId: editor.tabId })

    expect(editingOf(editor)).toMatchObject({
      state: 'readOnly',
      problem: `"${CONNECTION_NAME}" is read-only: allow writes on it to edit rows.`,
      rows: [],
      preview: null,
    })
  })
})
