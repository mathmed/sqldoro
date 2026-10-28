import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import {
  postedTabs,
  type QueryHarness,
  queryHarness,
  readyPanel,
  sqlEditor,
} from '../../../test/support/query.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import { QueryCancelledError } from '../../core/engine/query.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { TransactionMode } from '../../core/safety/transaction.ts'
import type { RunParts, RunWork } from './run-types.ts'

let harness: QueryHarness

function uriOf(editor: { document: { uri: unknown } }): vscode.Uri {
  return editor.document.uri as vscode.Uri
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
  harness = queryHarness()
})

describe('QueryRunner.cancel', () => {
  it('should say the statement is being cancelled until it stops', async () => {
    harness.engine.answer = () => ({ isPending: true })
    const stopping = Promise.withResolvers<undefined>()
    harness.engine.cancel.mockImplementationOnce(async () => stopping.promise)
    const editor = await sqlEditor(harness, 'SELECT pg_sleep(9)')
    const panel = readyPanel(harness, editor)

    const running = harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await vi.waitFor(() => {
      expect(harness.engine.requests).toHaveLength(1)
    })
    const cancelled = harness.runner.cancel(uriOf(editor))
    expect(postedTabs(panel).get('id-1')).toMatchObject({
      status: 'running',
      progress: 'cancelling',
    })
    stopping.resolve(undefined)
    await cancelled
    await running

    expect(postedTabs(panel).get('id-1')).toMatchObject({ status: 'cancelled', progress: 'done' })
  })

  it('should end a run whose session is still opening, run nothing, and log what it left', async () => {
    const opening = Promise.withResolvers<never>()
    harness.connect.mockImplementationOnce(async () => opening.promise)
    const editor = await sqlEditor(harness, 'SELECT 1')

    const running = harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await vi.waitFor(() => {
      expect(harness.connect).toHaveBeenCalledOnce()
    })
    await harness.runner.cancel(uriOf(editor))
    await running
    opening.reject(new Error('connect ETIMEDOUT'))

    expect(harness.runner.isRunning(uriOf(editor))).toBe(false)
    expect(harness.engine.requests).toStrictEqual([])
    await vi.waitFor(() => {
      expect(harness.log.warn).toHaveBeenCalledWith(
        'What a cancelled run no longer waited for failed: connect ETIMEDOUT',
      )
    })
  })

  it('should end a run that is still planning, and never do its work', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')
    const uri = uriOf(editor)
    const planned = Promise.withResolvers<undefined>()
    const work = vi.fn<(parts: RunParts) => Promise<void>>()

    const performing = harness.runner.perform(uri, async () =>
      planned.promise.then((): RunWork => ({ statements: ['SELECT 1'], run: work })),
    )
    await vi.waitFor(() => {
      expect(harness.runner.isRunning(uri)).toBe(true)
    })
    await harness.runner.cancel(uri)
    await performing
    planned.resolve(undefined)
    await new Promise((settled) => setImmediate(settled))

    expect(work).not.toHaveBeenCalled()
    expect(harness.runner.isRunning(uri)).toBe(false)
    expect(harness.log.warn).not.toHaveBeenCalled()
  })

  it('should start no statement once a run is cancelled while its transaction opens', async () => {
    harness = queryHarness({ transactionMode: TransactionMode.Manual })
    harness.engine.status = TransactionStatus.Open
    const begin = Promise.withResolvers<undefined>()
    harness.engine.answer = (request) =>
      request.sql.startsWith('START TRANSACTION') ? { after: begin.promise } : {}
    const editor = await sqlEditor(harness, 'SELECT 1')
    const panel = readyPanel(harness, editor)

    const running = harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await vi.waitFor(() => {
      expect(harness.engine.requests).toHaveLength(1)
    })
    await harness.runner.cancel(uriOf(editor))
    begin.resolve(undefined)
    await running

    expect(harness.engine.requests.map((request) => request.sql)).toStrictEqual([
      'START TRANSACTION',
    ])
    expect(postedTabs(panel).get('id-1')).toMatchObject({ status: 'cancelled' })
    expect(harness.records).toStrictEqual([])
  })

  it('should cancel a tab still shown running when nothing runs for its source', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')
    const panel = readyPanel(harness, editor)
    const stale = new ResultSet({
      values: [],
      id: 'stale',
      sql: 'SELECT 1',
      kind: 'rows',
      canServerView: false,
      canRefresh: false,
    })
    harness.panels.get(uriOf(editor))?.addTab(stale)

    await harness.runner.cancel(uriOf(editor))

    expect(postedTabs(panel).get('stale')).toMatchObject({ status: 'cancelled', progress: 'done' })
    expect(harness.engine.cancel).not.toHaveBeenCalled()
  })

  it('should say in its tab when a cancel closed the connection of the statement', async () => {
    harness.engine.answer = () => ({
      error: new QueryCancelledError({ hasClosedConnection: true }),
    })
    const editor = await sqlEditor(harness, 'SELECT pg_sleep(9)')
    const panel = readyPanel(harness, editor)

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)

    expect(postedTabs(panel).get('id-1')).toMatchObject({
      status: 'cancelled',
      notice:
        'The server did not confirm in time that the statement stopped, so sqldoro closed its connection: a statement that writes may still have run. The next statement opens a new connection.',
    })
    expect(harness.records.map((entry) => entry.outcome)).toStrictEqual(['cancelled'])
  })
})
