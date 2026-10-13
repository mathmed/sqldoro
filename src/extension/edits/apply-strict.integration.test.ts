// The edits of the grid on a MySQL session that is not in strict mode, as the extension host applies
// them: strict mode holds for the apply only, and the session gets its own sql_mode back. The grid
// refuses a text longer than its column before anything runs; what it does not check, as a moment
// after the last one a TIMESTAMP holds (which a loose session would store as zero), the server
// refuses.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  cell,
  closeGrid,
  edit,
  type GridEditor,
  openGrid,
  previewAndApply,
} from '../../../test/integration/editor.ts'
import { firstRow, query } from '../../../test/integration/edits.ts'
import { connectRequest, MYSQL, waitUntilReady } from '../../../test/integration/servers.ts'
import { resetVscode, webviewPanels } from '../../../test/vscode.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { createEngineRegistry } from '../factories/engines.ts'

const LOOSE = 'ONLY_FULL_GROUP_BY,NO_ENGINE_SUBSTITUTION'
const TARGET = {
  engineId: 'mysql',
  server: MYSQL,
  schema: '',
  sql: 'SELECT * FROM it_strict_orders ORDER BY id',
}
const SETUP = [
  'DROP TABLE IF EXISTS it_strict_orders',
  `CREATE TABLE it_strict_orders (
    id int PRIMARY KEY, status varchar(8) NOT NULL,
    seen timestamp NULL) ENGINE=InnoDB`,
]
const SEEDED = [
  [1, 'ACTIVE', null],
  [2, 'ACTIVE', null],
]

let observer: EngineSession
let editor: GridEditor | undefined

async function rows(): Promise<unknown> {
  const result = await query(observer, 'SELECT id, status, seen FROM it_strict_orders ORDER BY id')
  return result.rows
}

// The session of the editor, made loose as a server outside strict mode makes it.
async function looseSession(grid: GridEditor): Promise<EngineSession> {
  const session = await grid.query.editorSessions.existing(grid.uri.toString())
  if (session === undefined) {
    throw new Error('the editor has no session')
  }
  await query(session.engineSession, 'SET SESSION sql_mode = ?', [LOOSE])
  return session.engineSession
}

async function sessionMode(session: EngineSession): Promise<unknown> {
  const row = await firstRow(session, 'SELECT @@SESSION.sql_mode')
  return row?.[0]
}

describe('the edits of the grid applied on a MySQL session outside strict mode', () => {
  beforeAll(async () => {
    await waitUntilReady(async () => {
      observer = await createEngineRegistry().get('mysql').connect(connectRequest(MYSQL))
    })
    for (const statement of SETUP) {
      await query(observer, statement)
    }
  })

  beforeEach(async () => {
    resetVscode()
    webviewPanels.length = 0
    await query(observer, 'DELETE FROM it_strict_orders')
    await query(
      observer,
      "INSERT INTO it_strict_orders VALUES (1, 'ACTIVE', NULL), (2, 'ACTIVE', NULL)",
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

  it('should apply the changes, then give the session its sql_mode back', async () => {
    editor = await openGrid(TARGET)
    const session = await looseSession(editor)
    edit(editor, { kind: EditKind.Set, block: cell(0, 1), input: 'INACTIVE' })

    const editing = await previewAndApply(editor)

    expect(editing).toMatchObject({
      notice: 'Applied 1 update on sqldoro.it_strict_orders.',
      isNoticeError: false,
    })
    await expect(rows()).resolves.toStrictEqual([
      [1, 'INACTIVE', null],
      [2, 'ACTIVE', null],
    ])
    await expect(sessionMode(session)).resolves.toBe(LOOSE)
  })

  it('should let the server refuse a value it would change, write nothing, and give the sql_mode back', async () => {
    editor = await openGrid(TARGET)
    const session = await looseSession(editor)
    edit(editor, { kind: EditKind.Set, block: cell(0, 1), input: 'INACTIVE' })
    edit(editor, { kind: EditKind.Set, block: cell(1, 2), input: '2038-12-31 00:00:00' })

    const editing = await previewAndApply(editor)

    expect(editing.isNoticeError).toBe(true)
    expect(editing.notice).toMatch(
      /^Nothing was applied: id = 2: Incorrect datetime value: '2038-12-31 00:00:00' for column 'seen'/,
    )
    await expect(rows()).resolves.toStrictEqual(SEEDED)
    await expect(sessionMode(session)).resolves.toBe(LOOSE)
  })
})
