import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
  type QueryHarness,
  queryHarness,
  SHOP_BINDING,
  sqlEditor,
} from '../../../test/support/query.ts'
import { resetVscode, showEditor, webviewPanels, window, workspace } from '../../../test/vscode.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { CommandId } from '../command-id.ts'
import { registerEditorCommands } from './editor-commands.ts'

let harness: QueryHarness
let disposables: vscode.Disposable[]

function uriOf(editor: { document: { uri: unknown } }): vscode.Uri {
  return editor.document.uri as vscode.Uri
}

beforeEach(() => {
  resetVscode()
  webviewPanels.length = 0
  for (const prompt of [
    window.showInformationMessage,
    window.showErrorMessage,
    window.showWarningMessage,
  ]) {
    prompt.mockReset()
  }
  harness = queryHarness()
  disposables = registerEditorCommands({
    runner: harness.runner,
    bindings: harness.bindings,
    transactions: harness.transactions,
    panels: harness.panels,
    connections: (id) => harness.connections.get(id),
    pickBinding: harness.pickBinding,
    log: harness.log,
  })
})

afterEach(() => {
  for (const disposable of disposables) {
    disposable.dispose()
  }
})

describe('New Query', () => {
  it('should open a SQL editor in the database and schema of an explorer node', async () => {
    await vscode.commands.executeCommand(CommandId.NewQuery, {
      connectionId: 'shop',
      place: { database: 'analytics', schema: 'audit', name: '' },
    })

    const editor = window.activeTextEditor
    expect(editor?.document.languageId).toBe('sql')
    expect(harness.bindings.get(uriOf(editor ?? { document: { uri: undefined } }))).toStrictEqual({
      connectionId: 'shop',
      database: 'analytics',
      schema: 'audit',
    })
  })

  it('should open in the database of a connection node', async () => {
    await vscode.commands.executeCommand(CommandId.NewQuery, { connectionId: 'crm' })

    expect(
      harness.bindings.get(uriOf(window.activeTextEditor ?? { document: { uri: undefined } })),
    ).toStrictEqual({
      connectionId: 'crm',
      database: 'crm',
      schema: '',
    })
  })

  it('should ask for the connection from anywhere else, and open nothing when dismissed', async () => {
    harness.pickBinding.mockResolvedValueOnce(SHOP_BINDING)

    await vscode.commands.executeCommand(CommandId.NewQuery, { connectionId: 'gone' })
    await vscode.commands.executeCommand(CommandId.NewQuery)

    expect(harness.pickBinding).toHaveBeenCalledTimes(2)
    expect(workspace.textDocuments).toHaveLength(1)
  })
})

describe('Change Connection', () => {
  it('should change the connection of the SQL editor in front', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')
    harness.pickBinding.mockResolvedValueOnce({ connectionId: 'crm', database: 'crm', schema: '' })

    await vscode.commands.executeCommand(CommandId.ChangeConnection)

    expect(harness.bindings.get(uriOf(editor))?.connectionId).toBe('crm')
  })

  it('should keep the connection while a transaction is open on it', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')
    harness.engine.status = TransactionStatus.Open
    await vscode.commands.executeCommand(CommandId.RunQuery)

    await vscode.commands.executeCommand(CommandId.ChangeConnection)

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Commit or roll back the open transaction of this editor before changing its connection.',
    )
    expect(harness.pickBinding).not.toHaveBeenCalled()
    expect(harness.bindings.get(uriOf(editor))).toStrictEqual(SHOP_BINDING)
  })

  it('should keep the connection when the pick is dismissed', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')

    await vscode.commands.executeCommand(CommandId.ChangeConnection)

    expect(harness.bindings.get(uriOf(editor))).toStrictEqual(SHOP_BINDING)
  })

  it('should need a SQL editor', async () => {
    showEditor(await workspace.openTextDocument({ language: 'markdown', content: '' }))

    await vscode.commands.executeCommand(CommandId.ChangeConnection)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Open a SQL editor first: sqldoro runs the statements of SQL documents.',
    )
    expect(harness.pickBinding).not.toHaveBeenCalled()
  })
})

describe('Run, Cancel and Explain', () => {
  it('should run the statement under the cursor, or the whole script', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1;\nSELECT 2;')
    editor.select(12)

    await vscode.commands.executeCommand(CommandId.RunQuery)
    await vscode.commands.executeCommand(CommandId.RunScript)

    expect(harness.engine.requests.map((request) => request.sql)).toStrictEqual([
      'SELECT 2',
      'SELECT 1',
      'SELECT 2',
    ])
  })

  it('should explain, and measure only once agreed', async () => {
    await sqlEditor(harness, 'SELECT 1')
    window.showWarningMessage.mockResolvedValueOnce('Run EXPLAIN ANALYZE')

    await vscode.commands.executeCommand(CommandId.Explain)
    await vscode.commands.executeCommand(CommandId.ExplainAnalyze)

    expect(harness.engine.requests.map((request) => request.sql)).toStrictEqual([
      'EXPLAIN SELECT 1',
      'EXPLAIN (ANALYZE, BUFFERS) SELECT 1',
    ])
  })

  it('should cancel the query of the editor in front', async () => {
    harness.engine.answer = () => ({ isPending: true })
    await sqlEditor(harness, 'SELECT pg_sleep(9)')

    const running = vscode.commands.executeCommand(CommandId.RunQuery)
    await vi.waitFor(() => {
      expect(harness.engine.requests).toHaveLength(1)
    })
    await vscode.commands.executeCommand(CommandId.CancelQuery)
    await running

    expect(harness.engine.cancel).toHaveBeenCalledOnce()
  })

  it('should run and explain nothing without a SQL editor, and cancel nothing without an editor', async () => {
    await vscode.commands.executeCommand(CommandId.RunQuery)
    await vscode.commands.executeCommand(CommandId.Explain)
    await vscode.commands.executeCommand(CommandId.CancelQuery)

    expect(harness.engine.requests).toStrictEqual([])
    expect(window.showInformationMessage).toHaveBeenCalledTimes(2)
  })
})

describe('Show Results', () => {
  it('should open the result view of the editor and answer once it has loaded', async () => {
    await sqlEditor(harness, 'SELECT 1')

    const shown = vscode.commands.executeCommand<boolean>(CommandId.ShowResults)
    webviewPanels[0]?.webview.send({ type: 'ready' })

    await expect(shown).resolves.toBe(true)
  })

  it('should answer false without a SQL editor', async () => {
    await expect(vscode.commands.executeCommand<boolean>(CommandId.ShowResults)).resolves.toBe(
      false,
    )
  })
})
