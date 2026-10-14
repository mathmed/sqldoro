import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import {
  postedTabs,
  type QueryHarness,
  queryHarness,
  readyPanel,
  SHOP,
  sqlEditor,
} from '../../../test/support/query.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { EnvironmentTag } from '../../core/connection/connection.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { TabKind } from '../../core/results/protocol.ts'
import { TransactionMode } from '../../core/safety/transaction.ts'
import { explain } from './explain.ts'

let harness: QueryHarness

async function runIn(text: string): Promise<vscode.TextEditor> {
  const editor = (await sqlEditor(harness, text)) as unknown as vscode.TextEditor
  await harness.runner.run(editor, RunScope.All)
  return editor
}

function sent(): string[] {
  return harness.engine.requests.map((request) => request.sql)
}

beforeEach(() => {
  resetVscode()
  for (const prompt of [
    window.showInformationMessage,
    window.showErrorMessage,
    window.showWarningMessage,
    window.showInputBox,
  ]) {
    prompt.mockReset()
  }
  harness = queryHarness()
})

describe('QueryRunner and the guards', () => {
  it('should block a script with a write on a read-only connection before connecting', async () => {
    harness.connections.set('shop', { ...SHOP, isReadOnly: true })

    await runIn('SELECT 1; UPDATE t SET a = 1 WHERE id = 1')

    expect(sent()).toStrictEqual([])
    expect(harness.connect).not.toHaveBeenCalled()
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      '"Shop" is read-only: sqldoro did not run this UPDATE. To write, allow writes on the connection first.',
      'Allow Writes…',
    )
  })

  it('should run what only reads on a read-only connection', async () => {
    harness.connections.set('shop', { ...SHOP, isReadOnly: true })

    await runIn('SELECT 1; SHOW search_path')

    expect(sent()).toStrictEqual(['SELECT 1', 'SHOW search_path'])
  })

  it('should run a DELETE of every row once its button is pressed, and only then', async () => {
    window.showWarningMessage
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('Run the DELETE of Every Row')

    const editor = await runIn('DELETE FROM t')
    expect(sent()).toStrictEqual([])
    await harness.runner.run(editor, RunScope.All)

    expect(sent()).toStrictEqual(['DELETE FROM t'])
    expect(window.showInputBox).not.toHaveBeenCalled()
  })

  it('should run nothing when the run is cancelled while a confirmation waits', async () => {
    const editor = (await sqlEditor(harness, 'DELETE FROM t')) as unknown as vscode.TextEditor
    window.showWarningMessage.mockImplementation(async () => {
      await harness.runner.cancel(editor.document.uri)
      return Promise.resolve('Run the DELETE of Every Row')
    })

    await harness.runner.run(editor, RunScope.All)

    expect(sent()).toStrictEqual([])
    expect(harness.connect).not.toHaveBeenCalled()
  })

  it('should ask for the button of a production connection before writing to it', async () => {
    harness.connections.set('shop', { ...SHOP, environment: EnvironmentTag.Production })
    window.showWarningMessage.mockResolvedValue('Run on Shop')

    await runIn('INSERT INTO t VALUES (1)')

    expect(window.showWarningMessage).toHaveBeenCalledOnce()
    expect(window.showInputBox).not.toHaveBeenCalled()
    expect(sent()).toStrictEqual(['INSERT INTO t VALUES (1)'])
  })

  it('should have the table typed after the button for a DELETE of every row on production', async () => {
    harness.connections.set('shop', { ...SHOP, environment: EnvironmentTag.Production })
    window.showWarningMessage.mockResolvedValue('Run on Shop')
    window.showInputBox.mockResolvedValueOnce(undefined).mockResolvedValueOnce('t')

    const editor = await runIn('DELETE FROM t')
    expect(sent()).toStrictEqual([])
    await harness.runner.run(editor, RunScope.All)

    expect(window.showWarningMessage).toHaveBeenCalledTimes(2)
    expect(sent()).toStrictEqual(['DELETE FROM t'])
  })

  it('should refuse a statement the guards did not approve, and say so in its tab', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')
    const panel = readyPanel(harness, editor)

    await harness.runner.perform(editor.document.uri as unknown as vscode.Uri, async () =>
      Promise.resolve({
        statements: ['SELECT 1'],
        run: async (parts) => {
          await harness.runner.runJob(parts, {
            sql: 'DROP TABLE t',
            values: [],
            place: undefined,
            isRecorded: false,
            kind: TabKind.Rows,
            shouldAutoLimit: false,
          })
        },
      }),
    )

    expect(sent()).toStrictEqual([])
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Could not run the query: sqldoro did not check this statement before running it, so it did not run',
    )
    expect(postedTabs(panel).get('id-1')).toMatchObject({
      sql: 'DROP TABLE t',
      status: 'failed',
      error: {
        message: 'sqldoro did not check this statement before running it, so it did not run',
      },
    })
  })
})

describe('QueryRunner and the automatic limit', () => {
  beforeEach(() => {
    harness = queryHarness({ autoLimit: 1000, maxRows: 50_000 })
  })

  it('should limit a query without a limit, and say so when the limit cut it', async () => {
    harness.engine.answer = () => ({ isTruncated: true })
    const editor = (await sqlEditor(
      harness,
      'SELECT * FROM orders -- all',
    )) as unknown as vscode.TextEditor
    const panel = readyPanel(harness, editor as never)

    await harness.runner.run(editor, RunScope.All)

    expect(harness.engine.requests.map(({ sql, maxRows }) => [sql, maxRows])).toStrictEqual([
      ['SELECT * FROM orders LIMIT 1001', 1000],
    ])
    expect([...postedTabs(panel).values()]).toMatchObject([
      { sql: 'SELECT * FROM orders', summary: { isTruncated: true, autoLimit: 1000 } },
    ])
    expect(harness.records[0]?.sql).toBe('SELECT * FROM orders')
  })

  it('should run queries with a limit of their own, writes and plans as written', async () => {
    await runIn('SELECT * FROM t LIMIT 5; INSERT INTO t VALUES (1)')
    const editor = (await sqlEditor(harness, 'SELECT * FROM t')) as unknown as vscode.TextEditor
    await explain(harness.runner, editor, false)

    expect(harness.engine.requests.map(({ sql, maxRows }) => [sql, maxRows])).toStrictEqual([
      ['SELECT * FROM t LIMIT 5', 50_000],
      ['INSERT INTO t VALUES (1)', 50_000],
      ['EXPLAIN SELECT * FROM t', 50_000],
    ])
  })
})

describe('QueryRunner and manual transactions', () => {
  beforeEach(() => {
    harness = queryHarness({ transactionMode: TransactionMode.Manual })
    harness.engine.status = TransactionStatus.Open
  })

  it('should open the transaction before the first statement only', async () => {
    const editor = await runIn('UPDATE t SET a = 1 WHERE id = 1; SELECT 1')
    await harness.runner.run(editor, RunScope.All)

    expect(sent()).toStrictEqual([
      'START TRANSACTION',
      'UPDATE t SET a = 1 WHERE id = 1',
      'SELECT 1',
      'UPDATE t SET a = 1 WHERE id = 1',
      'SELECT 1',
    ])
    expect(harness.transactions.of(editor.document.uri.toString()).statements).toBe(4)
  })

  it('should note in the tab when a statement ended the transaction nobody asked to end', async () => {
    const editor = (await sqlEditor(harness, 'SELECT 1')) as unknown as vscode.TextEditor
    const panel = readyPanel(harness, editor as never)
    await harness.runner.run(editor, RunScope.All)
    harness.engine.status = TransactionStatus.Idle
    harness.engine.answer = () => ({ error: new Error('deadlock detected') })

    await harness.runner.run(editor, RunScope.All)

    expect([...postedTabs(panel).values()]).toMatchObject([
      { status: 'failed', notice: 'The server rolled the open transaction back after this error.' },
    ])
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'The server rolled the open transaction back after this error.',
    )
  })

  it('should start a read-only transaction on a read-only connection', async () => {
    harness.connections.set('shop', { ...SHOP, isReadOnly: true })

    await runIn('SELECT 1')

    expect(sent()).toStrictEqual(['START TRANSACTION READ ONLY', 'SELECT 1'])
  })

  it('should not move an editor to another database while its transaction is open', async () => {
    const editor = await runIn('SELECT 1')
    await harness.bindings.set(editor.document.uri, {
      connectionId: 'shop',
      database: 'shop',
      schema: 'public',
    })

    await harness.runner.run(editor, RunScope.All)

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Could not run the query: Commit or roll back the open transaction of this editor before it changes database or schema.',
    )
    expect(vi.mocked(harness.engine.useScope)).toHaveBeenCalledOnce()
  })
})
