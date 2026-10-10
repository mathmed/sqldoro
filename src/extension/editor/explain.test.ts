import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import {
  lastDiagnostics,
  postedTabs,
  type QueryHarness,
  queryHarness,
  readyPanel,
  sqlEditor,
} from '../../../test/support/query.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { ErrorLocationKind, QueryError } from '../../core/engine/query-error.ts'
import { explain } from './explain.ts'

let harness: QueryHarness

beforeEach(() => {
  resetVscode()
  for (const prompt of [window.showInformationMessage, window.showWarningMessage]) {
    prompt.mockReset()
  }
  harness = queryHarness()
})

describe('explain', () => {
  it('should show the plan of the statement under the cursor in a plan tab', async () => {
    harness.engine.answer = () => ({ rows: [['Seq Scan on orders'], ['  Filter: (id > 1)']] })
    const editor = await sqlEditor(harness, 'SELECT * FROM orders WHERE id > 1')
    const panel = readyPanel(harness, editor)

    await explain(harness.runner, editor as unknown as vscode.TextEditor, false)

    expect(harness.engine.requests.map((request) => request.sql)).toStrictEqual([
      'EXPLAIN SELECT * FROM orders WHERE id > 1',
    ])
    expect([...postedTabs(panel).values()]).toMatchObject([
      {
        kind: 'plan',
        status: 'succeeded',
        plan: ['Seq Scan on orders', '  Filter: (id > 1)'],
        canServerView: false,
      },
    ])
    expect(harness.records.map((entry) => entry.sql)).toStrictEqual([
      'EXPLAIN SELECT * FROM orders WHERE id > 1',
    ])
  })

  it('should place an error of the plan in the statement as written', async () => {
    harness.engine.answer = () => ({
      error: new QueryError('syntax error at or near "FORM"', {
        kind: ErrorLocationKind.Offset,
        offset: 17,
      }),
    })
    const editor = await sqlEditor(harness, 'SELECT * FORM t')

    await explain(harness.runner, editor as unknown as vscode.TextEditor, false)

    expect(lastDiagnostics()).toMatchObject([
      { range: { start: { character: 9 }, end: { character: 13 } } },
    ])
  })

  it('should ask for the statement to explain', async () => {
    const editor = await sqlEditor(harness, '\n\n')

    await explain(harness.runner, editor as unknown as vscode.TextEditor, false)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Put the cursor on the statement to explain, or select it.',
    )
  })

  it('should explain a single statement only', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1; SELECT 2')
    editor.select(0, 18)

    await explain(harness.runner, editor as unknown as vscode.TextEditor, false)

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Select a single statement to explain.',
    )
    expect(harness.engine.requests).toStrictEqual([])
  })

  it('should not measure a statement that writes', async () => {
    const editor = await sqlEditor(harness, 'DELETE FROM orders')

    await explain(harness.runner, editor as unknown as vscode.TextEditor, true)

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'EXPLAIN ANALYZE runs the statement: sqldoro only runs it for a query that only reads (SELECT, WITH, TABLE or VALUES).',
    )
    expect(harness.engine.requests).toStrictEqual([])
  })

  it('should measure a query only once the user agrees', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')
    window.showWarningMessage.mockResolvedValueOnce(undefined)

    await explain(harness.runner, editor as unknown as vscode.TextEditor, true)
    expect(harness.engine.requests).toStrictEqual([])

    window.showWarningMessage.mockResolvedValueOnce('Run EXPLAIN ANALYZE')
    await explain(harness.runner, editor as unknown as vscode.TextEditor, true)

    expect(window.showWarningMessage).toHaveBeenLastCalledWith(
      'EXPLAIN ANALYZE runs the query on "Shop" to measure it.',
      {
        modal: true,
        detail:
          'The query runs for real: it takes as long and uses the same resources as running it.',
      },
      'Run EXPLAIN ANALYZE',
    )
    expect(harness.engine.requests.map((request) => request.sql)).toStrictEqual([
      'EXPLAIN (ANALYZE, BUFFERS) SELECT 1',
    ])
  })
})
