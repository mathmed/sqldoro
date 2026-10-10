import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { ORDERS_TABLE } from '../../../test/fixtures/tables.ts'
import {
  answerOrders,
  editableResult,
  editingOf,
  ORDERS_QUERY,
} from '../../../test/support/edits.ts'
import {
  type QueryHarness,
  queryHarness,
  readyPanel,
  SHOP,
  sqlEditor,
} from '../../../test/support/query.ts'
import { resetVscode } from '../../../test/vscode.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import { ColumnKind } from '../../core/engine/query.ts'
import { IDENTITY_VIEW } from '../../core/results/view.ts'

let harness: QueryHarness

beforeEach(() => {
  resetVscode()
  harness = queryHarness()
  answerOrders(harness)
})

describe('checkEditing', () => {
  it('should find the rows of one table editable, reading it on the session of the explorer', async () => {
    const result = await editableResult(harness)

    expect(editingOf(result.tab)).toMatchObject({
      state: 'editable',
      table: 'sales.orders',
      key: ['id'],
    })
    expect(harness.engine.describeTable).toHaveBeenCalledWith('shop', ORDERS_TABLE)
  })

  it('should not even look at the rows of a read-only connection', async () => {
    harness.connections.set('shop', { ...SHOP, isReadOnly: true })

    const result = await editableResult(harness)

    expect(editingOf(result.tab)).toMatchObject({
      state: 'readOnly',
      problem: '"Shop" is read-only: allow writes on it to edit rows.',
    })
    expect(harness.engine.describeTable).not.toHaveBeenCalled()
  })

  it('should say why the text of the query keeps its rows read-only', async () => {
    const result = await editableResult(harness, 'SELECT DISTINCT id FROM sales.orders')

    expect(editingOf(result.tab).problem).toBe(
      'The query removes duplicate rows (DISTINCT): its rows are not rows of a table.',
    )
  })

  it('should say why the columns the server describes keep the rows read-only', async () => {
    answerOrders(harness, () => ({
      columns: [{ name: 'n', dataType: 'INT4', kind: ColumnKind.Number }],
      rows: [[1]],
    }))

    const result = await editableResult(harness, 'SELECT n FROM sales.orders')

    expect(editingOf(result.tab).problem).toBe(
      'The server does not say which table "n" comes from.',
    )
  })

  it('should say the table could not be read when the catalog fails, and log why', async () => {
    harness.engine.describeTable.mockRejectedValue(new Error('permission denied for pg_class'))

    const result = await editableResult(harness)

    expect(editingOf(result.tab).problem).toBe(
      'sqldoro could not read the table of these rows: permission denied for pg_class',
    )
    expect(harness.log.warn).toHaveBeenCalledWith(
      'Could not tell whether a result can be edited: permission denied for pg_class',
    )
  })

  it('should drop what it found once the rows were read again', async () => {
    let release = (): void => undefined
    harness.engine.describeTable.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          release = () => {
            resolve(undefined)
          }
        }),
    )
    const fake = await sqlEditor(harness, ORDERS_QUERY)
    const uri = fake.document.uri as unknown as vscode.Uri
    const panel = readyPanel(harness, fake)
    await harness.runner.run(fake as unknown as vscode.TextEditor, RunScope.All)
    await expect.poll(() => harness.engine.describeTable.mock.calls.length).toBe(1)
    const tab = harness.panels.get(uri)?.tab('id-1')
    tab?.restart(IDENTITY_VIEW)
    const postedBefore = panel.webview.posted.length

    release()
    await new Promise((resolve) => setImmediate(resolve))

    expect(tab?.toTab().editing.state).toBe('none')
    expect(panel.webview.posted).toHaveLength(postedBefore)
  })
})
