import { beforeEach, describe, expect, it } from 'vitest'

import {
  answerOrders,
  edit,
  type EditableResult,
  editableResult,
  editingOf,
  previewAndApply,
} from '../../../test/support/edits.ts'
import { type QueryHarness, queryHarness } from '../../../test/support/query.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { TransactionMode } from '../../core/safety/transaction.ts'

let harness: QueryHarness

function sent(): string[] {
  return harness.engine.requests.map((request) => request.sql)
}

async function twoNotes(): Promise<EditableResult> {
  const result = await editableResult(harness)
  await edit(result, {
    kind: EditKind.Set,
    block: { firstRow: 0, lastRow: 1, columns: [2] },
    input: 'x',
  })
  return result
}

beforeEach(() => {
  resetVscode()
  for (const prompt of [
    window.showInformationMessage,
    window.showErrorMessage,
    window.showWarningMessage,
  ]) {
    prompt.mockReset()
  }
  harness = queryHarness()
})

describe('applyEdits, when something goes wrong', () => {
  it('should find every row changed meanwhile, then roll everything back', async () => {
    answerOrders(harness, (request) =>
      request.sql.startsWith('UPDATE') ? { affectedRows: 0 } : undefined,
    )
    const result = await twoNotes()

    await previewAndApply(result)

    expect(sent().slice(1)).toEqual([
      'START TRANSACTION',
      expect.stringMatching(/^UPDATE/),
      expect.stringMatching(/^UPDATE/),
      'ROLLBACK',
    ])
    expect(editingOf(result.tab)).toMatchObject({
      state: 'editable',
      rows: [
        {
          row: 0,
          problem: 'id = 1 changed or was deleted since sqldoro read it: it was not overwritten.',
        },
        {
          row: 1,
          problem: 'id = 2 changed or was deleted since sqldoro read it: it was not overwritten.',
        },
      ],
      notice:
        'Nothing was applied: id = 1 changed or was deleted since sqldoro read it: it was not overwritten. (1 more row did not apply either.)',
      isNoticeError: true,
    })
    expect(window.showErrorMessage).toHaveBeenCalledWith(editingOf(result.tab).notice)
    expect(harness.log.warn).toHaveBeenCalledWith(
      'Edits on "Shop": nothing applied to sales.orders (2 rows refused)',
    )
  })

  it('should stop at a statement the server refuses, and roll back', async () => {
    answerOrders(harness, (request) =>
      request.sql.startsWith('UPDATE')
        ? { error: new Error('value too long for type character varying(20)') }
        : undefined,
    )
    const result = await twoNotes()

    await previewAndApply(result)

    expect(sent().slice(1)).toEqual([
      'START TRANSACTION',
      expect.stringMatching(/^UPDATE/),
      'ROLLBACK',
    ])
    expect(editingOf(result.tab).notice).toBe(
      'Nothing was applied: id = 1: value too long for type character varying(20)',
    )
  })

  it('should stop at a statement that would change more rows than its own, and roll back', async () => {
    answerOrders(harness, (request) =>
      request.sql.startsWith('UPDATE') ? { affectedRows: 2 } : undefined,
    )
    const result = await twoNotes()

    await previewAndApply(result)

    expect(sent().slice(1)).toEqual([
      'START TRANSACTION',
      expect.stringMatching(/^UPDATE/),
      'ROLLBACK',
    ])
    expect(editingOf(result.tab).notice).toBe(
      'Nothing was applied: id = 1 would have changed 2 rows instead of 1.',
    )
  })

  it('should stop and roll back when the apply is cancelled', async () => {
    answerOrders(harness, (request) =>
      request.sql.startsWith('UPDATE') ? { isPending: true } : undefined,
    )
    const result = await twoNotes()
    harness.engine.cancel.mockImplementation(async () => Promise.resolve())

    result.panel.webview.send({ type: 'previewEdits', tabId: result.tab.id })
    result.panel.webview.send({ type: 'applyEdits', tabId: result.tab.id, previewId: 1 })
    await expect.poll(() => sent().filter((sql) => sql.startsWith('UPDATE'))).toHaveLength(1)
    result.panel.webview.send({ type: 'cancel' })
    await expect.poll(() => editingOf(result.tab).state).toBe('editable')

    expect(sent().slice(-1)).toStrictEqual(['ROLLBACK'])
    expect(editingOf(result.tab).notice).toBe(
      'Nothing was applied: id = 1: The apply was cancelled.',
    )
  })

  it('should stop between statements once the apply is cancelled', async () => {
    const cancel = { now: (): void => undefined }
    answerOrders(harness, (request) => {
      if (request.sql.startsWith('UPDATE')) {
        cancel.now()
        return { affectedRows: 1 }
      }
      return undefined
    })
    const result = await twoNotes()
    cancel.now = () => void harness.runner.cancel(result.editor.document.uri)

    await previewAndApply(result)

    expect(sent().filter((sql) => sql.startsWith('UPDATE'))).toHaveLength(1)
    expect(sent().slice(-1)).toStrictEqual(['ROLLBACK'])
    expect(editingOf(result.tab).notice).toBe(
      'Nothing was applied: the apply stopped before its end.',
    )
  })

  it('should not apply anything when the commit fails, and roll back', async () => {
    answerOrders(harness, (request) =>
      request.sql === 'COMMIT' ? { error: new Error('deferred constraint violated') } : undefined,
    )
    const result = await twoNotes()

    await previewAndApply(result)

    expect(sent().slice(-2)).toStrictEqual(['COMMIT', 'ROLLBACK'])
    expect(editingOf(result.tab).notice).toBe(
      'Nothing was applied: the commit failed: deferred constraint violated',
    )
  })

  it('should close the session of the editor when it cannot roll back', async () => {
    answerOrders(harness, (request) => {
      if (request.sql.startsWith('UPDATE')) {
        return { affectedRows: 0 }
      }
      return request.sql === 'ROLLBACK' ? { error: new Error('connection lost') } : undefined
    })
    const result = await twoNotes()

    await previewAndApply(result)

    expect(harness.closeSession).toHaveBeenCalled()
    expect(harness.log.error).toHaveBeenCalledWith(
      'Could not roll back the changes of a result: connection lost',
    )
    expect(editingOf(result.tab).notice).toMatch(
      /sqldoro could not roll them back, so it closed the connection of this editor: the server rolled them back\.$/,
    )
  })

  it('should roll back to its savepoint in the transaction of the editor', async () => {
    harness = queryHarness({ transactionMode: TransactionMode.Manual })
    harness.engine.status = TransactionStatus.Open
    answerOrders(harness, (request) =>
      request.sql.startsWith('UPDATE') ? { affectedRows: 0 } : undefined,
    )
    const result = await twoNotes()

    await previewAndApply(result)

    expect(sent().slice(-2)).toStrictEqual([
      'ROLLBACK TO SAVEPOINT sqldoro_edits',
      'RELEASE SAVEPOINT sqldoro_edits',
    ])
    expect(harness.transactions.isOpen(result.editor.document.uri.toString())).toBe(true)
  })

  it('should apply a preview once, however many times it is confirmed', async () => {
    answerOrders(harness)
    const result = await twoNotes()
    result.panel.webview.send({ type: 'previewEdits', tabId: result.tab.id })

    result.panel.webview.send({ type: 'applyEdits', tabId: result.tab.id, previewId: 1 })
    result.panel.webview.send({ type: 'applyEdits', tabId: result.tab.id, previewId: 1 })
    await expect.poll(() => sent().filter((sql) => sql === 'COMMIT')).toHaveLength(1)
    await expect.poll(() => editingOf(result.tab).state).toBe('editable')

    expect(sent().filter((sql) => sql === 'START TRANSACTION')).toHaveLength(1)
    expect(harness.log.debug).toHaveBeenCalledWith('An apply of a preview that is gone was dropped')
  })
})
