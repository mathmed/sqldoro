import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import {
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
const VIEW = { sort: [{ column: 0, isDescending: true }], filters: [] }

let harness: QueryHarness

interface Ran {
  readonly panel: FakeWebviewPanel
  readonly document: { readonly uri: unknown }
}

async function ranEditor(sql: string): Promise<Ran> {
  const editor = await sqlEditor(harness, sql)
  const panel = readyPanel(harness, editor)
  await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)
  return { panel, document: editor.document }
}

function limits(): (readonly [string, number])[] {
  return harness.engine.requests.map(({ sql, maxRows }) => [sql, maxRows] as const)
}

beforeEach(() => {
  resetVscode()
  window.showInformationMessage.mockReset()
  harness = queryHarness({ autoLimit: 2, maxRows: 100 })
  harness.engine.answer = () => ({ columns: [NAME], rows: [['b'], ['a']], isTruncated: true })
})

describe('loadAllRows', () => {
  it('should run the query of the tab again without its automatic limit, into the same tab', async () => {
    const { panel } = await ranEditor('SELECT name FROM t')
    harness.engine.answer = () => ({ columns: [NAME], rows: [['b'], ['a'], ['c']] })

    panel.webview.send({ type: 'loadAll', tabId: 'id-1' })

    await vi.waitFor(() => {
      expect(postedTabs(panel).get('id-1')).toMatchObject({
        status: 'succeeded',
        loadedRows: 3,
        summary: { isTruncated: false, autoLimit: null },
      })
    })
    expect(limits()).toStrictEqual([
      ['SELECT name FROM t LIMIT 3', 2],
      ['SELECT name FROM t', 100],
    ])
    expect(harness.records).toHaveLength(1)
  })

  it('should keep a view sorted on the server, without its automatic limit', async () => {
    const { panel, document } = await ranEditor('SELECT name FROM t')
    panel.webview.send({ type: 'setView', tabId: 'id-1', view: VIEW, isServerSide: true })
    await vi.waitFor(() => {
      expect(harness.engine.requests).toHaveLength(2)
      expect(harness.runner.isRunning(document.uri as vscode.Uri)).toBe(false)
    })

    panel.webview.send({ type: 'loadAll', tabId: 'id-1' })

    await vi.waitFor(() => {
      expect(harness.engine.requests).toHaveLength(3)
    })
    const wrapped = 'SELECT * FROM (\nSELECT name FROM t\n) AS sqldoro_view\nORDER BY "name" DESC'
    expect(limits().slice(1)).toStrictEqual([
      [`${wrapped} LIMIT 3`, 2],
      [wrapped, 100],
    ])
  })

  it('should say when the editor of the result is closed', async () => {
    const { panel, document } = await ranEditor('SELECT name FROM t')
    closeDocument(document as Parameters<typeof closeDocument>[0])

    panel.webview.send({ type: 'loadAll', tabId: 'id-1' })

    await vi.waitFor(() => {
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'The editor of this result is closed: run the query again.',
      )
    })
  })
})
