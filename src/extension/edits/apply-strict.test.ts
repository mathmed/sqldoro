import { beforeEach, describe, expect, it } from 'vitest'

import {
  answerOrders,
  cell,
  edit,
  type EditableResult,
  editableResult,
  editingOf,
  ORDERS_QUERY,
  previewAndApply,
} from '../../../test/support/edits.ts'
import { type QueryHarness, queryHarness } from '../../../test/support/query.ts'
import { STRICT_WRITES_OFF, STRICT_WRITES_ON } from '../../../test/support/sessions.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { TransactionMode } from '../../core/safety/transaction.ts'

let harness: QueryHarness

const UPDATE_NOTE = 'UPDATE "sales"."orders" SET "note" = $1 WHERE "id" = $2 AND "note" = $3'
const NOT_RESTORED =
  'sqldoro could not turn strict mode off again in the session of this editor (Lost connection to MySQL server): it stays on until the connection is disconnected.'

// What the session went through once the rows were first read.
function timeline(): string[] {
  return harness.engine.timeline.slice(harness.engine.timeline.indexOf(ORDERS_QUERY) + 1)
}

async function noteChanged(): Promise<EditableResult> {
  const result = await editableResult(harness)
  await edit(result, { kind: EditKind.Set, block: cell(1, 2), input: 'x' })
  return result
}

beforeEach(() => {
  resetVscode()
  for (const prompt of [window.showInformationMessage, window.showErrorMessage]) {
    prompt.mockReset()
  }
  harness = queryHarness()
  answerOrders(harness)
})

describe('applyEdits, with the strict writes of the session', () => {
  it('should turn them on around its own transaction, then put the session back', async () => {
    const result = await noteChanged()

    await previewAndApply(result)

    await expect
      .poll(timeline)
      .toStrictEqual([
        STRICT_WRITES_ON,
        'START TRANSACTION',
        UPDATE_NOTE,
        'COMMIT',
        STRICT_WRITES_OFF,
        ORDERS_QUERY,
      ])
    expect(editingOf(result.tab).notice).toBe('Applied 1 update on sales.orders.')
  })

  it('should turn them on around its savepoint in the open transaction of the editor', async () => {
    harness = queryHarness({ transactionMode: TransactionMode.Manual })
    answerOrders(harness)
    harness.engine.status = TransactionStatus.Open
    const result = await noteChanged()

    await previewAndApply(result)

    await expect
      .poll(timeline)
      .toStrictEqual([
        STRICT_WRITES_ON,
        'SAVEPOINT sqldoro_edits',
        UPDATE_NOTE,
        'RELEASE SAVEPOINT sqldoro_edits',
        STRICT_WRITES_OFF,
        ORDERS_QUERY,
      ])
    expect(harness.transactions.isOpen(result.editor.document.uri.toString())).toBe(true)
  })

  it('should apply nothing when the session cannot turn them on, with the server error', async () => {
    harness.engine.strictWritesError = new Error("Variable 'sql_mode' can't be set")
    const result = await noteChanged()

    await previewAndApply(result)

    expect(timeline()).toStrictEqual([])
    expect(editingOf(result.tab)).toMatchObject({
      notice:
        "Nothing was applied: the session could not be put in strict mode: Variable 'sql_mode' can't be set",
      isNoticeError: true,
      rows: [{ row: 1 }],
    })
  })

  it('should put the session back after changes the server refused', async () => {
    answerOrders(harness, (request) =>
      request.sql.startsWith('UPDATE')
        ? { error: new Error("Data too long for column 'note'") }
        : undefined,
    )
    const result = await noteChanged()

    await previewAndApply(result)

    expect(timeline()).toStrictEqual([
      STRICT_WRITES_ON,
      'START TRANSACTION',
      UPDATE_NOTE,
      'ROLLBACK',
      STRICT_WRITES_OFF,
    ])
    expect(editingOf(result.tab).notice).toBe(
      "Nothing was applied: id = 2: Data too long for column 'note'",
    )
  })

  it('should put the session back after an apply that was cancelled', async () => {
    answerOrders(harness, (request) =>
      request.sql.startsWith('UPDATE') ? { isPending: true } : undefined,
    )
    const result = await noteChanged()

    result.panel.webview.send({ type: 'previewEdits', tabId: result.tab.id })
    result.panel.webview.send({ type: 'applyEdits', tabId: result.tab.id, previewId: 1 })
    await expect.poll(() => timeline().at(-1)).toBe(UPDATE_NOTE)
    result.panel.webview.send({ type: 'cancel' })
    await expect.poll(() => editingOf(result.tab).state).toBe('editable')

    expect(timeline().slice(-2)).toStrictEqual(['ROLLBACK', STRICT_WRITES_OFF])
  })

  it('should say so, and log it, when the session cannot be put back', async () => {
    harness.engine.restoreError = new Error('Lost connection to MySQL server')
    const result = await noteChanged()

    await previewAndApply(result)

    const message = `Applied 1 update on sales.orders. ${NOT_RESTORED}`
    expect(window.showInformationMessage).toHaveBeenCalledWith(message)
    await expect.poll(() => editingOf(result.tab).notice).toBe(message)
    expect(harness.log.error).toHaveBeenCalledWith(
      'Could not turn strict mode off again after the edits of a result: Lost connection to MySQL server',
    )
    expect(harness.closeSession).not.toHaveBeenCalled()
  })

  it('should not put back a session it closed because it could not roll back', async () => {
    harness.engine.restoreError = new Error('Lost connection to MySQL server')
    answerOrders(harness, (request) => {
      if (request.sql.startsWith('UPDATE')) {
        return { affectedRows: 0 }
      }
      return request.sql === 'ROLLBACK' ? { error: new Error('connection lost') } : undefined
    })
    const result = await noteChanged()

    await previewAndApply(result)

    expect(harness.closeSession).toHaveBeenCalled()
    expect(harness.log.error).not.toHaveBeenCalledWith(
      expect.stringMatching(/^Could not turn strict mode off/),
    )
    expect(editingOf(result.tab).notice).toMatch(/the server rolled them back\.$/)
  })

  it('should put the session back when the batch fails before its statements', async () => {
    answerOrders(harness, (request) =>
      request.sql === 'START TRANSACTION' ? { error: new Error('server gone') } : undefined,
    )
    const result = await noteChanged()

    await previewAndApply(result)

    expect(timeline()).toStrictEqual([STRICT_WRITES_ON, 'START TRANSACTION', STRICT_WRITES_OFF])
    expect(window.showErrorMessage).toHaveBeenCalledWith('Could not run the query: server gone')
    expect(editingOf(result.tab).notice).toBe('Nothing was applied: the changes did not run.')
  })

  it('should log a session it cannot put back after a batch that failed', async () => {
    harness.engine.restoreError = new Error('Lost connection to MySQL server')
    answerOrders(harness, (request) =>
      request.sql === 'START TRANSACTION' ? { error: new Error('server gone') } : undefined,
    )
    const result = await noteChanged()

    await previewAndApply(result)

    expect(window.showErrorMessage).toHaveBeenCalledWith('Could not run the query: server gone')
    expect(harness.log.error).toHaveBeenCalledWith(
      'Could not turn strict mode off again after the edits of a result: Lost connection to MySQL server',
    )
  })

  it('should leave the session as it was after one apply after another', async () => {
    const result = await noteChanged()
    await previewAndApply(result)
    await expect.poll(() => timeline().at(-1)).toBe(ORDERS_QUERY)
    await edit(result, { kind: EditKind.Set, block: cell(1, 2), input: 'y' })

    await previewAndApply(result)

    await expect.poll(() => timeline().at(-1)).toBe(ORDERS_QUERY)
    const switches = timeline().filter((step) => step.startsWith('strict writes'))
    expect(switches).toStrictEqual([
      STRICT_WRITES_ON,
      STRICT_WRITES_OFF,
      STRICT_WRITES_ON,
      STRICT_WRITES_OFF,
    ])
  })
})
