// The extension host wired as in VS Code on real servers, when results are extreme and sessions die:
// a session the server ends while a query runs, a cell of 10 MB, a result of a thousand columns.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { RunScope } from '../../src/core/editor/run-plan.ts'
import type { EngineSession } from '../../src/core/engine/engine.ts'
import type { ResultSet } from '../../src/core/results/result-set.ts'
import { createEngineRegistry } from '../../src/extension/factories/engines.ts'
import { postedTabs } from '../support/query.ts'
import { Position, Range, resetVscode, webviewPanels, window } from '../vscode.ts'
import { closeGrid, type EditorTarget, type GridEditor, openGrid } from './editor.ts'
import { query } from './edits.ts'
import { connectRequest, MYSQL, POSTGRES, waitUntilReady } from './servers.ts'

interface Case extends EditorTarget {
  readonly name: string
  readonly sessionId: string
  readonly sleep: string
  readonly end: (id: string) => string
  readonly ended: RegExp
  readonly hugeValue: string
  readonly wideTable: string
  readonly columns: number
}

const HUGE_LENGTH = 10_000_000
// The grid gets long values cut; the cell detail asks for the rest.
const PREVIEW_LENGTH = 1000

function wideTable(name: string, columns: number): string {
  const list = Array.from({ length: columns }, (...[, index]) => `c${String(index)} int DEFAULT 1`)
  return `CREATE TABLE ${name} (id int PRIMARY KEY, ${list.join(', ')})`
}

const CASES: readonly Case[] = [
  {
    name: 'PostgreSQL',
    engineId: 'postgres',
    server: POSTGRES,
    schema: 'public',
    sql: 'SELECT pg_backend_pid() AS id',
    sessionId: 'SELECT pg_backend_pid() AS id',
    sleep: 'SELECT pg_sleep(30)',
    end: (id) => `SELECT pg_terminate_backend(${id})`,
    ended: /terminating connection due to administrator command|Connection terminated/,
    hugeValue: `SELECT repeat('abcdefghij', ${String(HUGE_LENGTH / 10)}) AS doc`,
    wideTable: 'it_robust_wide',
    columns: 1500,
  },
  {
    name: 'MySQL',
    engineId: 'mysql',
    server: MYSQL,
    schema: '',
    sql: 'SELECT CONNECTION_ID() AS id',
    sessionId: 'SELECT CONNECTION_ID() AS id',
    sleep: 'SELECT SLEEP(30)',
    end: (id) => `KILL CONNECTION ${id}`,
    ended: /Connection lost|closed the connection|ECONNRESET/i,
    hugeValue: `SELECT REPEAT('abcdefghij', ${String(HUGE_LENGTH / 10)}) AS doc`,
    wideTable: 'it_robust_wide',
    columns: 1000,
  },
]

describe.each(CASES)('the SQL editor on a real $name server at its limits', (target) => {
  let observer: EngineSession
  let editor: GridEditor | undefined

  function lastTab(grid: GridEditor): Record<string, unknown> | undefined {
    return [...postedTabs(grid.panel).values()].at(-1)
  }

  // Replaces the text of the editor and runs it, like Run Script.
  async function runText(grid: GridEditor, sql: string): Promise<void> {
    const textEditor = window.activeTextEditor
    await textEditor?.edit((builder) => {
      builder.replace(new Range(new Position(0, 0), new Position(1000, 0)), sql)
    })
    await grid.query.runner.run(textEditor as unknown as vscode.TextEditor, RunScope.All)
  }

  function currentResult(grid: GridEditor): ResultSet | undefined {
    const id = String(lastTab(grid)?.['id'])
    return grid.query.panels.get(grid.uri)?.tab(id)
  }

  beforeAll(async () => {
    const engine = createEngineRegistry().get(target.engineId)
    await waitUntilReady(async () => {
      observer = await engine.connect(connectRequest(target.server))
    })
    await query(observer, `DROP TABLE IF EXISTS ${target.wideTable}`)
    await query(observer, wideTable(target.wideTable, target.columns))
    await query(observer, `INSERT INTO ${target.wideTable} (id) VALUES (1), (2)`)
  })

  beforeEach(() => {
    resetVscode()
    webviewPanels.length = 0
  })

  afterEach(async () => {
    if (editor !== undefined) {
      await closeGrid(editor)
    }
    editor = undefined
  })

  afterAll(async () => {
    await query(observer, `DROP TABLE IF EXISTS ${target.wideTable}`)
    await observer.close()
  })

  it('should say why a query failed when the server ends its session, and run the next one on a new session', async () => {
    editor = await openGrid(target)
    const sessionId = String(currentResult(editor)?.sourceRow(0)?.[0])
    const grid = editor

    const running = runText(grid, target.sleep)
    await expect.poll(() => lastTab(grid)?.['status']).toBe('running')
    await query(observer, target.end(sessionId))
    await running

    expect(lastTab(grid)).toMatchObject({
      status: 'failed',
      error: { message: expect.stringMatching(target.ended) as unknown },
    })
    await runText(grid, target.sessionId)
    expect(lastTab(grid)).toMatchObject({ status: 'succeeded', rowCount: 1 })
    expect(String(currentResult(grid)?.sourceRow(0)?.[0])).not.toBe(sessionId)
  })

  it('should keep a value of 10 MB whole, and send the grid only its start', async () => {
    editor = await openGrid({ ...target, sql: target.hugeValue })
    const result = currentResult(editor)
    if (result === undefined) {
      throw new Error('no result')
    }

    expect(String(result.cell(0, 0))).toHaveLength(HUGE_LENGTH)
    expect(result.window(0, 1, PREVIEW_LENGTH)).toStrictEqual([
      { cells: ['abcdefghij'.repeat(PREVIEW_LENGTH / 10)], truncated: [0] },
    ])
  })

  it('should read every column of a result a thousand columns wide', async () => {
    editor = await openGrid({ ...target, sql: `SELECT * FROM ${target.wideTable} ORDER BY id` })

    expect(currentResult(editor)?.columns).toHaveLength(target.columns + 1)
    expect(lastTab(editor)).toMatchObject({ status: 'succeeded', rowCount: 2 })
  })
})
