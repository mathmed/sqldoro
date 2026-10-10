import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { type QueryHarness, queryHarness, sqlEditor } from '../../../test/support/query.ts'
import {
  closeTab,
  commands,
  type FakeTextEditor,
  openTab,
  resetVscode,
  window,
  workspace,
} from '../../../test/vscode.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { TransactionMode } from '../../core/safety/transaction.ts'
import { CommandId } from '../command-id.ts'
import { watchClosedEditors } from './closed-editors.ts'
import { registerTransactionCommands } from './transaction-commands.ts'

let harness: QueryHarness
let disposables: { dispose: () => void }[]

async function openTransaction(
  status: TransactionStatus = TransactionStatus.Open,
): Promise<FakeTextEditor> {
  const editor = await sqlEditor(harness, 'UPDATE t SET a = 1 WHERE id = 1')
  harness.engine.status = status
  await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
  return editor
}

function sent(): string[] {
  return harness.engine.requests.map((request) => request.sql)
}

beforeEach(() => {
  resetVscode()
  for (const prompt of [
    window.showInformationMessage,
    window.showWarningMessage,
    window.showErrorMessage,
    window.showQuickPick,
  ]) {
    prompt.mockReset()
  }
  harness = queryHarness({ transactionMode: TransactionMode.Manual })
  const context = { ...harness, log: harness.log }
  disposables = [...registerTransactionCommands(context), watchClosedEditors(context)]
})

afterEach(() => {
  for (const disposable of disposables) {
    disposable.dispose()
  }
})

describe('the transaction commands', () => {
  it('should switch the mode of the SQL editor in front and answer how it shows', async () => {
    await sqlEditor(harness, 'SELECT 1')

    await expect(commands.executeCommand(CommandId.ToggleTransactionMode)).resolves.toBe(
      '$(check-all) Auto-commit',
    )
    await expect(commands.executeCommand(CommandId.ToggleTransactionMode)).resolves.toBe(
      '$(git-commit) Manual commit',
    )
  })

  it('should need a SQL editor', async () => {
    await window.showTextDocument(await workspace.openTextDocument({ language: 'markdown' }))

    await expect(commands.executeCommand(CommandId.ToggleTransactionMode)).resolves.toBeUndefined()
    await commands.executeCommand(CommandId.CommitTransaction)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Open a SQL editor first: sqldoro runs the statements of SQL documents.',
    )
  })

  it('should open a transaction on the first statement in manual mode, and commit it', async () => {
    await openTransaction()

    await commands.executeCommand(CommandId.CommitTransaction)

    expect(sent()).toStrictEqual(['START TRANSACTION', 'UPDATE t SET a = 1 WHERE id = 1', 'COMMIT'])
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Committed the transaction of "Untitled-1" on "Shop".',
    )
    expect(harness.transactions.isOpen('untitled:Untitled-1')).toBe(false)
  })

  it('should roll back from the status bar of an open transaction', async () => {
    await openTransaction()
    window.showQuickPick.mockImplementation(async (items: { label: string }[]) =>
      Promise.resolve(items.find((item) => item.label.includes('Roll Back'))),
    )

    await expect(commands.executeCommand(CommandId.ToggleTransactionMode)).resolves.toBe(
      '$(git-commit) Manual commit',
    )

    expect(sent().at(-1)).toBe('ROLLBACK')
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Rolled back the transaction of "Untitled-1" on "Shop".',
    )
  })

  it('should leave the transaction open when the choice is dismissed', async () => {
    await openTransaction()

    await expect(commands.executeCommand(CommandId.ToggleTransactionMode)).resolves.toBe(
      '$(circle-filled) Transaction: 1 statement',
    )
    expect(sent().at(-1)).toBe('UPDATE t SET a = 1 WHERE id = 1')
  })

  it('should say when there is nothing to commit, and refuse to commit a failed transaction', async () => {
    await sqlEditor(harness, 'SELECT 1')
    await commands.executeCommand(CommandId.RollbackTransaction)
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'There is no open transaction in this editor.',
    )

    harness.engine.answer = (request) =>
      request.sql.startsWith('UPDATE') ? { error: new Error('division by zero') } : {}
    await openTransaction(TransactionStatus.Failed)
    await commands.executeCommand(CommandId.CommitTransaction)

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'The transaction failed: the database can only roll it back. Roll it back to go on.',
    )
    expect(sent()).not.toContain('COMMIT')
  })

  it('should not end a transaction while a query runs in the editor', async () => {
    const editor = await openTransaction()
    harness.engine.answer = () => ({ isPending: true })
    const running = harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    await vi.waitFor(() => {
      expect(harness.runner.isRunning(editor.document.uri as unknown as vscode.Uri)).toBe(true)
    })

    await commands.executeCommand(CommandId.CommitTransaction)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'A query is already running in this editor: cancel it first.',
    )
    await harness.runner.cancel(editor.document.uri as unknown as vscode.Uri)
    await running
  })
})

describe('closing the editor of an open transaction', () => {
  it('should ask to commit or roll back once its last tab closes', async () => {
    const editor = await openTransaction()
    const first = openTab(editor.document.uri)
    const second = openTab(editor.document.uri)
    window.showWarningMessage.mockResolvedValue('Commit')

    closeTab(first)
    expect(window.showWarningMessage).not.toHaveBeenCalled()
    closeTab(second)

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      '"Untitled-1" was closed with an open transaction: commit or roll it back.',
      'Commit',
      'Roll Back',
    )
    await vi.waitFor(() => {
      expect(sent().at(-1)).toBe('COMMIT')
    })
  })

  it('should roll back when asked, and do nothing when dismissed or when the document is gone', async () => {
    const editor = await openTransaction()
    window.showWarningMessage.mockResolvedValueOnce('Roll Back').mockResolvedValueOnce(undefined)

    closeTab(openTab(editor.document.uri))
    await vi.waitFor(() => {
      expect(sent().at(-1)).toBe('ROLLBACK')
    })

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
    closeTab(openTab(editor.document.uri))
    await Promise.resolve()
    expect(sent().at(-1)).toBe('UPDATE t SET a = 1 WHERE id = 1')
  })

  it('should not ask for other tabs or for editors without a transaction', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')

    closeTab(openTab(editor.document.uri))
    closeTab({ input: 'settings' })

    expect(window.showWarningMessage).not.toHaveBeenCalled()
  })
})
