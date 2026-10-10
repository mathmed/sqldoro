// An editable result in the SQL editors of the extension: sales.orders as the fake catalog
// describes it, its rows as the scripted session returns them, and the messages the result view
// sends to change, preview and apply them.
import { expect, vi } from 'vitest'
import type * as vscode from 'vscode'

import { RunScope } from '../../src/core/editor/run-plan.ts'
import type { EditKind } from '../../src/core/edits/edit-kind.ts'
import type { QueryRequest, Row } from '../../src/core/engine/query.ts'
import type { CellRange, TabEditing } from '../../src/core/results/protocol.ts'
import type { ResultSet } from '../../src/core/results/result-set.ts'
import { ORDERS, ORDERS_RESULT, ORDERS_TABLE } from '../fixtures/tables.ts'
import type { FakeWebviewPanel } from '../vscode.ts'
import { type QueryHarness, readyPanel, sqlEditor } from './query.ts'
import type { Answer } from './sessions.ts'

export const ORDERS_QUERY = 'SELECT * FROM sales.orders'
// id, code, note, total, payload, placed_at, total_cents
const ORDERS_ROWS: readonly Row[] = [
  [1, 'A-1', null, '12.50', '{"a": 1}', '2026-01-02 03:04:05+00', 1250],
  [2, 'A-2', 'gift', null, null, '2026-01-03 03:04:05+00', null],
]

// A tab of results and the panel that shows it: an editor's, or a table's.
export interface GridResult {
  readonly panel: FakeWebviewPanel
  readonly tab: ResultSet
}

export interface EditableResult extends GridResult {
  readonly editor: vscode.TextEditor
}

const WRITE = /^(UPDATE|INSERT|DELETE)/

// Every write changes one row; the query of the orders returns them.
export function answerOrders(
  harness: QueryHarness,
  answers: (request: QueryRequest) => Answer | undefined = () => undefined,
): void {
  const { engine } = harness
  engine.tables.set(JSON.stringify(ORDERS_TABLE), ORDERS)
  engine.answer = (request) => answers(request) ?? defaultAnswer(request)
}

function defaultAnswer(request: QueryRequest): Answer {
  if (request.sql.startsWith('SELECT')) {
    return { columns: ORDERS_RESULT, rows: ORDERS_ROWS }
  }
  return WRITE.test(request.sql) ? { affectedRows: 1 } : {}
}

// Runs the query of the orders and waits until the grid knows it can edit them.
export async function editableResult(
  harness: QueryHarness,
  query = ORDERS_QUERY,
): Promise<EditableResult> {
  const fake = await sqlEditor(harness, query)
  const editor = fake as unknown as vscode.TextEditor
  const panel = readyPanel(harness, fake)
  await harness.runner.run(editor, RunScope.All)
  const tab = harness.panels.get(editor.document.uri)?.tab('id-1')
  if (tab === undefined) {
    throw new Error('the query made no tab')
  }
  await vi.waitFor(() => {
    expect(['editable', 'readOnly']).toContain(tab.toTab().editing.state)
  })
  return { editor, panel, tab }
}

export function editingOf(tab: ResultSet): TabEditing {
  return tab.toTab().editing
}

export function cell(row: number, column: number): CellRange {
  return { firstRow: row, lastRow: row, firstColumn: column, lastColumn: column }
}

// What the result view sends when the user changes cells or rows.
export async function edit(
  { panel, tab }: GridResult,
  change: { readonly kind: EditKind; readonly range?: CellRange | null; readonly input?: string },
): Promise<void> {
  panel.webview.send({
    type: 'edit',
    tabId: tab.id,
    viewVersion: tab.viewVersion,
    edit: { range: null, input: '', ...change },
  })
  await vi.waitFor(() => {
    expect(panel.webview.posted.length).toBeGreaterThan(0)
  })
}

// Previews the changes, then applies the preview, and waits until the apply is over.
export async function previewAndApply(result: GridResult): Promise<void> {
  result.panel.webview.send({ type: 'previewEdits', tabId: result.tab.id })
  const preview = editingOf(result.tab).preview
  if (preview === null) {
    throw new Error(`nothing to preview: ${editingOf(result.tab).notice}`)
  }
  result.panel.webview.send({ type: 'applyEdits', tabId: result.tab.id, previewId: preview.id })
  await vi.waitFor(() => {
    expect(editingOf(result.tab).state).not.toBe('applying')
  })
}
