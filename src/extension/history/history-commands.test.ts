import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { historyEntry } from '../../../test/fixtures/history.ts'
import { answerInputs, answerQuickPicks } from '../../../test/support/prompts.ts'
import { type QueryHarness, queryHarness } from '../../../test/support/query.ts'
import { env, resetVscode, window } from '../../../test/vscode.ts'
import { CommandId } from '../command-id.ts'
import { registerHistoryCommands } from './history-commands.ts'
import { HistoryStore } from './history-store.ts'

let harness: QueryHarness
let history: HistoryStore
let disposables: vscode.Disposable[]

const ENTRY = historyEntry('a', { sql: 'SELECT * FROM orders', database: 'shop', schema: 'audit' })

function node(entry = ENTRY): unknown {
  return { kind: 'historyEntry', entry }
}

beforeEach(async () => {
  resetVscode()
  for (const prompt of [
    window.showWarningMessage,
    window.showInformationMessage,
    window.showQuickPick,
    window.showInputBox,
    env.clipboard.writeText,
  ]) {
    prompt.mockReset()
  }
  harness = queryHarness()
  history = new HistoryStore(new FakeMemento(), harness.log, () => 10)
  await history.add(ENTRY)
  await history.add(
    historyEntry('b', { connectionId: 'gone', sql: 'DELETE FROM t', message: 'permission denied' }),
  )
  disposables = registerHistoryCommands({
    history,
    bindings: harness.bindings,
    runner: harness.runner,
    connections: (id) => harness.connections.get(id),
    log: harness.log,
  })
})

afterEach(() => {
  for (const disposable of disposables) {
    disposable.dispose()
  }
})

describe('history commands', () => {
  it('should open a statement in an editor on its connection, database and schema', async () => {
    await vscode.commands.executeCommand(CommandId.OpenHistoryEntry, node())

    const editor = window.activeTextEditor
    expect(editor?.document.getText()).toBe('SELECT * FROM orders')
    expect(harness.bindings.get(editor?.document.uri as unknown as vscode.Uri)).toStrictEqual({
      connectionId: 'shop',
      database: 'shop',
      schema: 'audit',
    })
  })

  it('should open a statement of a deleted connection without a connection', async () => {
    await vscode.commands.executeCommand(
      CommandId.OpenHistoryEntry,
      node(historyEntry('b', { connectionId: 'gone' })),
    )

    expect(
      harness.bindings.get(window.activeTextEditor?.document.uri as unknown as vscode.Uri),
    ).toBeUndefined()
  })

  it('should run a statement again in a new editor', async () => {
    await vscode.commands.executeCommand(CommandId.RunHistoryEntry, node())

    expect(harness.engine.requests.map((request) => request.sql)).toStrictEqual([
      'SELECT * FROM orders',
    ])
  })

  it('should copy a statement and delete one', async () => {
    await vscode.commands.executeCommand(CommandId.CopyHistoryEntry, node())
    await vscode.commands.executeCommand(CommandId.DeleteHistoryEntry, node())

    expect(env.clipboard.writeText).toHaveBeenCalledWith('SELECT * FROM orders')
    expect(history.find('a')).toBeUndefined()
  })

  it('should let the user pick the entry from the Command Palette', async () => {
    answerQuickPicks('DELETE FROM t')

    await vscode.commands.executeCommand(CommandId.CopyHistoryEntry)

    expect(env.clipboard.writeText).toHaveBeenCalledWith('DELETE FROM t')
    const [items, options] = (window.showQuickPick.mock.calls[0] ?? []) as unknown[]
    expect(items).toMatchObject([
      {
        label: 'DELETE FROM t',
        description: ' · 2026-10-10 03:04 UTC',
        detail: 'permission denied',
      },
      { label: 'SELECT * FROM orders', description: 'Shop · 2026-10-10 03:04 UTC' },
    ])
    expect(options).toMatchObject({
      title: 'Query History',
      matchOnDescription: true,
      matchOnDetail: true,
    })
  })

  it('should do nothing for an entry that is gone or a dismissed pick', async () => {
    answerQuickPicks(undefined)

    await vscode.commands.executeCommand(CommandId.CopyHistoryEntry, node(historyEntry('zzz')))
    await vscode.commands.executeCommand(CommandId.CopyHistoryEntry, { kind: 'historyConnection' })

    expect(env.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('should clear the history once the user agrees', async () => {
    window.showWarningMessage
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('Clear History')

    await vscode.commands.executeCommand(CommandId.ClearHistory)
    expect(history.list()).toHaveLength(2)
    await vscode.commands.executeCommand(CommandId.ClearHistory)

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Clear the query history of every connection?',
      { modal: true },
      'Clear History',
    )
    expect(history.list()).toStrictEqual([])
  })

  it('should search the statements and messages, then do what the user picks', async () => {
    answerInputs('permission')
    answerQuickPicks('DELETE FROM t', 'Copy SQL')

    await vscode.commands.executeCommand(CommandId.SearchHistory)

    expect(env.clipboard.writeText).toHaveBeenCalledWith('DELETE FROM t')
    expect(window.showQuickPick.mock.calls[0]?.[0]).toHaveLength(1)
  })

  it('should say when nothing matches, and stop when the search is dismissed', async () => {
    answerInputs('nothing like this', undefined)

    await vscode.commands.executeCommand(CommandId.SearchHistory)
    await vscode.commands.executeCommand(CommandId.SearchHistory)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'No statement of the query history matches.',
    )
    expect(window.showQuickPick).not.toHaveBeenCalled()
  })

  it('should stop when no action is picked', async () => {
    answerInputs('orders')
    answerQuickPicks('SELECT * FROM orders', undefined)

    await vscode.commands.executeCommand(CommandId.SearchHistory)

    expect(env.clipboard.writeText).not.toHaveBeenCalled()
  })
})
