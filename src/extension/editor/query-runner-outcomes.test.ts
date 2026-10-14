import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import {
  postedTabs,
  type QueryHarness,
  queryHarness,
  readyPanel,
  sqlEditor,
} from '../../../test/support/query.ts'
import type { Answer } from '../../../test/support/sessions.ts'
import { type FakeWebviewPanel, resetVscode, webviewPanels, window } from '../../../test/vscode.ts'
import { EnvironmentTag } from '../../core/connection/connection.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import type { QueryRequest } from '../../core/engine/query.ts'
import { ColumnKind } from '../../core/engine/query.ts'

const ID = { name: 'id', dataType: 'INT8', kind: ColumnKind.Number }

let harness: QueryHarness

async function runIn(text: string): Promise<vscode.TextEditor> {
  const editor = (await sqlEditor(harness, text)) as unknown as vscode.TextEditor
  await harness.runner.run(editor, RunScope.All)
  return editor
}

// The one result panel the runs opened, loaded.
function onlyPanel(): FakeWebviewPanel {
  expect(webviewPanels).toHaveLength(1)
  const [panel] = webviewPanels
  if (panel === undefined) {
    throw new Error('no result panel')
  }
  panel.webview.send({ type: 'ready' })
  return panel
}

function answerBy(answers: Readonly<Record<string, Answer>>): void {
  harness.engine.answer = (request: QueryRequest) => answers[request.sql.split(' ')[0] ?? ''] ?? {}
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
})

describe('QueryRunner.run, statements without a result set', () => {
  it('should open no panel for an UPDATE of a new editor, and tell its outcome', async () => {
    answerBy({ UPDATE: { affectedRows: 3 } })

    const editor = await runIn('UPDATE t SET a = 1 WHERE id > 1')

    expect(webviewPanels).toHaveLength(0)
    expect(harness.panels.get(editor.document.uri)?.isOpen).toBe(false)
    expect(window.showInformationMessage).toHaveBeenCalledExactlyOnceWith(
      'UPDATE: 3 rows affected · 20 ms',
    )
    expect(harness.records).toMatchObject([
      { sql: 'UPDATE t SET a = 1 WHERE id > 1', outcome: 'succeeded', rowCount: 3 },
    ])
  })

  it('should tell the outcomes of a script of writes and DDL in one notification', async () => {
    answerBy({ INSERT: { affectedRows: 1 } })

    await runIn('INSERT INTO t VALUES (1); ALTER TABLE t ADD c int')

    expect(webviewPanels).toHaveLength(0)
    expect(window.showInformationMessage).toHaveBeenCalledExactlyOnceWith(
      '2 statements ran: INSERT: 1 row affected · 20 ms; ALTER TABLE done · 30 ms',
    )
    expect(harness.schemaChanges).toStrictEqual(['shop'])
  })

  it('should show the outcome in the panel of the editor when it is open, and tell nothing else', async () => {
    answerBy({ DELETE: { affectedRows: 2 } })
    const editor = await sqlEditor(harness, 'DELETE FROM t WHERE id < 3')
    const panel = readyPanel(harness, editor)
    panel.reveal.mockClear()

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)

    expect(webviewPanels).toHaveLength(1)
    expect(panel.reveal).toHaveBeenCalledOnce()
    expect([...postedTabs(panel).values()]).toMatchObject([
      { sql: 'DELETE FROM t WHERE id < 3', status: 'succeeded', columns: [] },
    ])
    expect(window.showInformationMessage).not.toHaveBeenCalled()
  })

  it('should open the panel at once for a script that reads, with the outcomes of the others', async () => {
    answerBy({ SELECT: { columns: [ID], rows: [['1']] }, UPDATE: { affectedRows: 1 } })

    await runIn('UPDATE t SET a = 1 WHERE id = 1; SELECT id FROM t')

    const tabs = [...postedTabs(onlyPanel()).values()]
    expect(tabs.map((tab) => [tab['sql'], tab['columns']])).toStrictEqual([
      ['UPDATE t SET a = 1 WHERE id = 1', []],
      ['SELECT id FROM t', [ID]],
    ])
    expect(window.showInformationMessage).not.toHaveBeenCalled()
  })

  it('should open the panel once a write returns rows, named for its connection', async () => {
    harness.connections.set('shop', {
      ...(harness.connections.get('shop') ?? ({} as never)),
      environment: EnvironmentTag.Development,
    })
    answerBy({ UPDATE: { columns: [ID], rows: [['1']], affectedRows: 1 } })

    await runIn('UPDATE t SET a = 1 WHERE id = 1 RETURNING id')

    expect(onlyPanel().title).toMatch(/DEV$/u)
    expect(window.showInformationMessage).not.toHaveBeenCalled()
  })

  it('should open the panel with the message of the server when a statement fails', async () => {
    answerBy({ UPDATE: { error: new Error('relation "t" does not exist') } })

    const editor = await runIn('UPDATE t SET a = 1 WHERE id = 1; INSERT INTO t VALUES (1)')

    expect([...postedTabs(onlyPanel()).values()]).toMatchObject([
      {
        status: 'failed',
        error: { message: 'relation "t" does not exist' },
        notice: '1 statement after this one did not run.',
      },
    ])
    expect(harness.panels.get(editor.document.uri)?.isOpen).toBe(true)
    expect(window.showInformationMessage).not.toHaveBeenCalled()
  })

  it('should keep the panel of the editor closed for writes, and open it for a read', async () => {
    answerBy({ SELECT: { columns: [ID], rows: [['1']] } })
    const editor = await sqlEditor(harness, 'SET search_path = sales;\nSELECT id FROM t;')

    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.Current)
    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.Current)
    expect(webviewPanels).toHaveLength(0)
    editor.select(30)
    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.Current)

    expect(window.showInformationMessage.mock.calls).toStrictEqual([
      ['SET done · 20 ms'],
      ['SET done · 20 ms'],
    ])
    expect([...postedTabs(onlyPanel()).values()]).toMatchObject([{ sql: 'SELECT id FROM t' }])
  })

  it('should forget the closed panel of an editor that closes', async () => {
    const editor = await runIn('SET search_path = sales')

    harness.panels.close(editor.document.uri)

    expect(harness.panels.get(editor.document.uri)).toBeUndefined()
    expect(webviewPanels).toHaveLength(0)
  })
})
