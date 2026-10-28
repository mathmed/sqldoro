// A cancel in the SQL editor on real servers when the network stops answering, the extension host
// wired as in VS Code: the wait ends with the tab cancelled and why, the user hears that the open
// transaction is gone, and the next query runs on a new session.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { RunScope } from '../../src/core/editor/run-plan.ts'
import { postedTabs } from '../support/query.ts'
import { type StallProxy, startStallProxy } from '../support/stall-proxy.ts'
import { Position, Range, resetVscode, settings, webviewPanels, window } from '../vscode.ts'
import { closeGrid, type EditorTarget, type GridEditor, openGrid } from './editor.ts'
import { MYSQL, POSTGRES } from './servers.ts'

// Long enough for the statement to reach the server before the network stops.
const STARTED_MS = 300

interface Case extends EditorTarget {
  readonly name: string
  readonly sleep: string
}

const CASES: readonly Case[] = [
  {
    name: 'MySQL',
    engineId: 'mysql',
    server: MYSQL,
    schema: '',
    sql: 'SELECT 1 AS one',
    sleep: 'SELECT SLEEP(20) AS slept',
  },
  {
    name: 'PostgreSQL',
    engineId: 'postgres',
    server: POSTGRES,
    schema: 'public',
    sql: 'SELECT 1 AS one',
    sleep: 'SELECT pg_sleep(20)',
  },
]

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

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

describe.each(CASES)('a cancel in the SQL editor on a real $name server', (target) => {
  let proxy: StallProxy | undefined
  let editor: GridEditor | undefined

  beforeEach(() => {
    resetVscode()
    webviewPanels.length = 0
  })

  // The proxy goes first: the connections it stalled (the explorer's too) fail at once, and close.
  afterEach(async () => {
    await proxy?.close()
    proxy = undefined
    if (editor !== undefined) {
      await closeGrid(editor)
    }
    editor = undefined
  })

  it('should end the wait when the network stops, say the open transaction is gone, and run the next query on a new session', async () => {
    settings.set('sqldoro.transactions.defaultMode', 'manual')
    proxy = await startStallProxy(target.server.endpoint)
    editor = await openGrid(target, { host: proxy.endpoint.host, port: proxy.endpoint.port })
    const grid = editor
    const running = runText(grid, target.sleep)
    await expect.poll(() => lastTab(grid)?.['status']).toBe('running')
    await delay(STARTED_MS)
    proxy.stallOpen()

    await grid.query.runner.cancel(grid.uri)
    await running

    expect(lastTab(grid)).toMatchObject({
      status: 'cancelled',
      notice: expect.stringContaining('sqldoro closed its connection') as unknown,
    })
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('ended: the server rolled back its open transaction.'),
    )
    await runText(grid, 'SELECT 2 AS two')
    expect(lastTab(grid)).toMatchObject({ status: 'succeeded', rowCount: 1 })
  })
})
