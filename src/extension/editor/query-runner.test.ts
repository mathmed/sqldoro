import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import {
  lastDiagnostics,
  postedTabs,
  type QueryHarness,
  queryHarness,
  readyPanel,
  SHOP_BINDING,
  sqlEditor,
} from '../../../test/support/query.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import { ErrorLocationKind, QueryError } from '../../core/engine/query-error.ts'
import { ColumnKind } from '../../core/engine/query.ts'

const ID = { name: 'id', dataType: 'INT8', kind: ColumnKind.Number }

let harness: QueryHarness

function uriOf(editor: { document: { uri: unknown } }): vscode.Uri {
  return editor.document.uri as vscode.Uri
}

async function settle(): Promise<void> {
  await vi.waitFor(() => {
    expect(harness.runner.isRunning(window.activeTextEditor?.document.uri as vscode.Uri)).toBe(
      false,
    )
  })
}

beforeEach(() => {
  resetVscode()
  for (const prompt of [
    window.showInformationMessage,
    window.showErrorMessage,
    window.showWarningMessage,
  ]) {
    prompt.mockReset()
  }
  harness = queryHarness({ maxRows: 50 })
})

describe('QueryRunner.run', () => {
  it('should run the statement under the cursor on the editor connection, into a tab', async () => {
    harness.engine.answer = () => ({ columns: [ID], rows: [['1'], ['2']] })
    const editor = await sqlEditor(harness, 'SELECT 1;\nSELECT id FROM orders;')
    editor.select(12)
    const panel = readyPanel(harness, editor)

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.Current)

    expect(
      harness.engine.requests.map((request) => [request.sql, request.maxRows, request.values]),
    ).toStrictEqual([['SELECT id FROM orders', 50, []]])
    expect(harness.connect).toHaveBeenCalledOnce()
    expect(harness.opened[0]?.connection).toMatchObject({ id: 'shop', database: 'shop' })
    expect(harness.engine.useScope).toHaveBeenCalledWith({ database: 'shop', schema: 'sales' })
    expect([...postedTabs(panel).values()]).toMatchObject([
      {
        id: 'id-1',
        title: 'SELECT id FROM orders',
        status: 'succeeded',
        rowCount: 2,
        canServerView: true,
      },
    ])
    expect(harness.records).toStrictEqual([
      {
        id: 'id-2',
        connectionId: 'shop',
        sql: 'SELECT id FROM orders',
        database: 'shop',
        schema: 'sales',
        startedAt: '2026-10-10T03:00:00.000Z',
        durationMs: expect.any(Number) as number,
        outcome: 'succeeded',
        rowCount: 2,
        message: '',
      },
    ])
  })

  it('should say when there is nothing to run', async () => {
    const editor = await sqlEditor(harness, '  -- nothing\n')

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.Current)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'There is no statement to run here: write one, select it or put the cursor on it.',
    )
    expect(harness.engine.requests).toStrictEqual([])
  })

  it('should ask for a connection the first time and keep it for the editor', async () => {
    harness.pickBinding.mockResolvedValueOnce(SHOP_BINDING)
    const editor = await sqlEditor(harness, 'SELECT 1', null)

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)

    expect(harness.engine.requests).toHaveLength(1)
    expect(harness.bindings.get(uriOf(editor))).toStrictEqual(SHOP_BINDING)
  })

  it('should run nothing when no connection is chosen', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1', null)

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)

    expect(harness.engine.requests).toStrictEqual([])
  })

  it('should refuse a connection that no longer exists', async () => {
    harness.connections.delete('shop')
    const editor = await sqlEditor(harness, 'SELECT 1')

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'The connection of this editor no longer exists: choose another one.',
    )
  })

  it('should stop at the first failure, place it in the editor and say what did not run', async () => {
    const located = new QueryError('syntax error at or near "FORM"', {
      kind: ErrorLocationKind.Offset,
      offset: 9,
    })
    harness.engine.answer = (request) =>
      request.sql.startsWith('SELECT *') ? { error: located } : { affectedRows: 3 }
    const editor = await sqlEditor(harness, 'UPDATE t SET a = 1;\nSELECT * FORM t;\nSELECT 3;')
    const panel = readyPanel(harness, editor)

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)

    expect(harness.engine.requests.map((request) => request.sql)).toStrictEqual([
      'UPDATE t SET a = 1',
      'SELECT * FORM t',
    ])
    expect([...postedTabs(panel).values()]).toMatchObject([
      { status: 'succeeded', summary: { affectedRows: 3 } },
      {
        status: 'failed',
        error: { message: 'syntax error at or near "FORM"', line: 2, column: 10 },
        notice: '1 statement after this one did not run.',
      },
    ])
    expect(lastDiagnostics()).toMatchObject([
      {
        message: 'syntax error at or near "FORM"',
        severity: 0,
        source: 'sqldoro',
        range: { start: { line: 1, character: 9 }, end: { line: 1, character: 13 } },
      },
    ])
    expect(
      harness.records.map((entry) => [entry.outcome, entry.rowCount, entry.message]),
    ).toStrictEqual([
      ['succeeded', 3, ''],
      ['failed', null, 'syntax error at or near "FORM"'],
    ])
  })

  it('should mark the whole statement for an error without a place', async () => {
    harness.engine.answer = () => ({ error: new Error('permission denied') })
    const editor = await sqlEditor(harness, '\n  DELETE FROM t')
    const panel = readyPanel(harness, editor)

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)

    expect(lastDiagnostics()).toMatchObject([
      { range: { start: { line: 1, character: 2 }, end: { line: 1, character: 15 } } },
    ])
    expect([...postedTabs(panel).values()]).toMatchObject([
      { error: { message: 'permission denied', line: null, column: null }, notice: '' },
    ])
  })

  it('should cancel the statement that runs and not run the rest', async () => {
    harness.engine.answer = () => ({ isPending: true })
    const editor = await sqlEditor(harness, 'SELECT pg_sleep(9); SELECT 2;')
    const panel = readyPanel(harness, editor)

    const running = harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await vi.waitFor(() => {
      expect(harness.engine.requests).toHaveLength(1)
    })
    expect(harness.runner.isRunning(uriOf(editor))).toBe(true)
    await harness.runner.cancel(uriOf(editor))
    await running

    expect([...postedTabs(panel).values()]).toMatchObject([
      { status: 'cancelled', notice: '1 statement after this one did not run.' },
    ])
    expect(harness.records.map((entry) => entry.outcome)).toStrictEqual(['cancelled'])
    expect(harness.runner.isRunning(uriOf(editor))).toBe(false)
  })

  it('should say why a cancel failed', async () => {
    harness.engine.answer = () => ({ isPending: true })
    harness.engine.cancel.mockRejectedValueOnce(new Error('must be a superuser'))
    const editor = await sqlEditor(harness, 'SELECT pg_sleep(9)')

    const running = harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await vi.waitFor(() => {
      expect(harness.engine.requests).toHaveLength(1)
    })
    await harness.runner.cancel(uriOf(editor))

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Could not cancel the query: must be a superuser',
    )
    await harness.runner.cancel(uriOf(editor))
    await running
  })

  it('should do nothing to cancel when nothing runs', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')

    await harness.runner.cancel(uriOf(editor))

    expect(harness.engine.cancel).not.toHaveBeenCalled()
  })

  it('should run one query at a time per editor', async () => {
    harness.engine.answer = () => ({ isPending: true })
    const editor = await sqlEditor(harness, 'SELECT 1')
    const changes = vi.fn()
    harness.runner.onDidChangeRunning(changes)

    const first = harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await vi.waitFor(() => {
      expect(harness.engine.requests).toHaveLength(1)
    })
    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await harness.runner.cancel(uriOf(editor))
    await first

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'A query is already running in this editor: cancel it first.',
    )
    expect(harness.engine.requests).toHaveLength(1)
    expect(changes).toHaveBeenCalledTimes(2)
  })

  it('should tell when a statement changed the schema', async () => {
    const editor = await sqlEditor(harness, 'CREATE TABLE t (a int); SELECT 1')

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)

    expect(harness.schemaChanges).toStrictEqual(['shop'])
  })

  it('should say why the connection of the editor could not open', async () => {
    harness = queryHarness({ openError: new Error('getaddrinfo ENOTFOUND db') })
    const editor = await sqlEditor(harness, 'SELECT 1')

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await settle()

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Could not run the query: getaddrinfo ENOTFOUND db',
    )
  })

  it('should log a statement the history could not keep', async () => {
    const harnessWithFailingHistory = harness
    vi.spyOn(harnessWithFailingHistory.records, 'push').mockImplementation(() => {
      throw new Error('quota')
    })
    const editor = await sqlEditor(harness, 'SELECT 1')

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)

    await vi.waitFor(() => {
      expect(harness.log.warn).toHaveBeenCalledWith(
        'Could not keep the statement in the history: quota',
      )
    })
  })

  it('should send the progress of the rows while they stream, at most every 100 ms', async () => {
    harness.engine.answer = (request) => {
      request.onColumns([ID])
      request.onRows([['1']])
      request.onRows([['2']])
      return { isPending: true }
    }
    const editor = await sqlEditor(harness, 'SELECT id FROM t')
    const panel = readyPanel(harness, editor)

    const running = harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await vi.waitFor(() => {
      expect(postedTabs(panel).get('id-1')).toMatchObject({ columns: [ID] })
    })
    const whileRunning = panel.webview.posted.filter(
      (message) => (message as { type: string }).type === 'tab',
    )
    await harness.runner.cancel(uriOf(editor))
    await running

    expect(whileRunning).toHaveLength(2)
    expect(postedTabs(panel).get('id-1')).toMatchObject({ status: 'cancelled', loadedRows: 2 })
  })

  it('should dispose its events', () => {
    const changes = vi.fn()
    harness.runner.onDidChangeRunning(changes)

    harness.runner.dispose()

    expect(changes).not.toHaveBeenCalled()
  })
})
