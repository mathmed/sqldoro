import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import {
  lastDiagnostics,
  postedTabs,
  type QueryHarness,
  queryHarness,
  readyPanel,
  sqlEditor,
} from '../../../test/support/query.ts'
import { closeDocument, type FakeWebviewPanel, resetVscode, window } from '../../../test/vscode.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import { ColumnKind } from '../../core/engine/query.ts'

const NAME = { name: 'name', dataType: 'TEXT', kind: ColumnKind.Text }
const VIEW = { sort: [{ column: 0, isDescending: true }], filters: [{ column: 0, text: 'a' }] }

let harness: QueryHarness

async function ranEditor(
  sql: string,
): Promise<{ readonly panel: FakeWebviewPanel; readonly document: unknown }> {
  const editor = await sqlEditor(harness, sql)
  const panel = readyPanel(harness, editor)
  await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
  return { panel, document: editor.document }
}

beforeEach(() => {
  resetVscode()
  window.showWarningMessage.mockReset()
  window.showInformationMessage.mockReset()
  harness = queryHarness()
  harness.engine.answer = () => ({ columns: [NAME], rows: [['b'], ['a']] })
})

describe('runServerView', () => {
  it('should run the query again, wrapped with the view, into the same tab', async () => {
    const { panel } = await ranEditor('SELECT name FROM t')
    harness.engine.answer = () => ({ columns: [NAME], rows: [['ab']] })

    panel.webview.send({ type: 'setView', tabId: 'id-1', view: VIEW, isServerSide: true })

    await vi.waitFor(() => {
      expect(postedTabs(panel).get('id-1')).toMatchObject({
        status: 'succeeded',
        loadedRows: 1,
        isServerView: true,
        view: VIEW,
      })
    })
    expect(harness.engine.requests.at(-1)).toMatchObject({
      sql: 'SELECT * FROM (\nSELECT name FROM t\n) AS sqldoro_view\nWHERE LOWER(CAST("name" AS TEXT)) LIKE $1\nORDER BY "name" DESC',
      values: ['%a%'],
    })
    expect(harness.records).toHaveLength(1)
    panel.webview.send({ type: 'fetchRows', tabId: 'id-1', viewVersion: 1, start: 0, count: 10 })
    await vi.waitFor(() => {
      expect(panel.webview.posted.at(-1)).toMatchObject({
        type: 'rows',
        tabId: 'id-1',
        rows: [{ cells: ['ab'], truncated: [] }],
      })
    })
  })

  it('should show a failure of the run on the server in the tab only', async () => {
    const { panel } = await ranEditor('SELECT name FROM t')
    harness.engine.answer = () => ({ error: new Error('canceling statement due to timeout') })

    panel.webview.send({ type: 'setView', tabId: 'id-1', view: VIEW, isServerSide: true })

    await vi.waitFor(() => {
      expect(postedTabs(panel).get('id-1')).toMatchObject({
        status: 'failed',
        error: { message: 'canceling statement due to timeout', line: null, column: null },
      })
    })
    expect(lastDiagnostics()).toBeUndefined()
  })

  it('should say why a statement cannot be sorted on the server', async () => {
    const { panel } = await ranEditor('SHOW search_path')

    panel.webview.send({ type: 'setView', tabId: 'id-1', view: VIEW, isServerSide: true })

    await vi.waitFor(() => {
      expect(window.showWarningMessage).toHaveBeenCalledWith(
        'Only a single query that reads (SELECT, WITH, TABLE or VALUES) can be sorted and filtered by the server',
      )
    })
  })

  it('should refuse to name a column that is not unique', async () => {
    harness.engine.answer = () => ({ columns: [NAME, NAME], rows: [] })
    const { panel } = await ranEditor('SELECT a.name, b.name FROM a, b')

    panel.webview.send({ type: 'setView', tabId: 'id-1', view: VIEW, isServerSide: true })

    await vi.waitFor(() => {
      expect(window.showWarningMessage).toHaveBeenCalledWith(
        'Columns with the same name cannot be sorted or filtered on the server: sort and filter the rows here instead.',
      )
    })
  })

  it('should say when the editor of the result is closed', async () => {
    const { panel, document } = await ranEditor('SELECT name FROM t')
    closeDocument(document as Parameters<typeof closeDocument>[0])

    panel.webview.send({ type: 'setView', tabId: 'id-1', view: VIEW, isServerSide: true })

    await vi.waitFor(() => {
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'The editor of this result is closed: run the query again.',
      )
    })
  })
})
