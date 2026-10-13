import { beforeEach, describe, expect, it } from 'vitest'

import {
  answerOrders,
  cell,
  edit,
  editableResult,
  editingOf,
  ORDERS_QUERY,
  previewAndApply,
} from '../../../test/support/edits.ts'
import { type QueryHarness, queryHarness, SHOP } from '../../../test/support/query.ts'
import { closeDocument, documents, resetVscode, window } from '../../../test/vscode.ts'
import { EnvironmentTag } from '../../core/connection/connection.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import { TransactionStatus } from '../../core/engine/transaction-status.ts'
import { TransactionMode } from '../../core/safety/transaction.ts'

let harness: QueryHarness

const UPDATE_NOTE = 'UPDATE "sales"."orders" SET "note" = $1 WHERE "id" = $2 AND "note" = $3'

function sent(): string[] {
  return harness.engine.requests.map((request) => request.sql)
}

function valuesOf(sql: string): unknown {
  return harness.engine.requests.find((request) => request.sql.startsWith(sql))?.values
}

beforeEach(() => {
  resetVscode()
  for (const prompt of [
    window.showInformationMessage,
    window.showErrorMessage,
    window.showWarningMessage,
    window.showInputBox,
  ]) {
    prompt.mockReset()
  }
  harness = queryHarness()
  answerOrders(harness)
})

describe('applyEdits', () => {
  it('should apply the changes in a transaction of their own, then read the rows again', async () => {
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.Set, block: cell(1, 2), input: 'birthday' })

    await previewAndApply(result)

    expect(sent()).toStrictEqual([
      ORDERS_QUERY,
      'START TRANSACTION',
      UPDATE_NOTE,
      'COMMIT',
      ORDERS_QUERY,
    ])
    expect(valuesOf('UPDATE')).toStrictEqual(['birthday', '2', 'gift'])
    expect(editingOf(result.tab)).toMatchObject({
      state: 'editable',
      rows: [],
      notice: 'Applied 1 update on sales.orders.',
      isNoticeError: false,
    })
    expect(window.showInformationMessage).toHaveBeenCalledWith('Applied 1 update on sales.orders.')
    expect(harness.log.info).toHaveBeenCalledWith(
      'Edits on "Shop": applied 1 update on sales.orders',
    )
  })

  it('should delete, update and insert in that order, confirming the deletions by their number', async () => {
    window.showWarningMessage.mockResolvedValue('Delete 1 Row')
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.Delete, block: cell(0, 0) })
    await edit(result, { kind: EditKind.SetNull, block: cell(1, 2) })
    await edit(result, { kind: EditKind.Insert })
    await edit(result, {
      kind: EditKind.Set,
      block: { firstRow: 2, lastRow: 2, columns: [0] },
      input: '3',
    })
    await edit(result, { kind: EditKind.Set, block: cell(2, 1), input: 'A-3' })

    await previewAndApply(result)

    expect(sent().slice(1, -1)).toStrictEqual([
      'START TRANSACTION',
      'DELETE FROM "sales"."orders" WHERE "id" = $1 AND "code" = $2 AND "note" IS NULL AND "total" = $3 AND CAST("payload" AS text) = $4 AND "placed_at" = $5',
      'UPDATE "sales"."orders" SET "note" = NULL WHERE "id" = $1 AND "note" = $2',
      'INSERT INTO "sales"."orders" ("id", "code", "note", "total", "payload", "placed_at", "total_cents") VALUES ($1, $2, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT)',
      'COMMIT',
    ])
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Delete 1 row of sales.orders?',
      { modal: true, detail: 'The changes delete 1 row of sales.orders on "Shop".' },
      'Delete 1 Row',
    )
  })

  it('should run nothing when the deletion is not confirmed, and keep the changes', async () => {
    window.showWarningMessage.mockResolvedValue(undefined)
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.Delete, block: cell(0, 0) })

    await previewAndApply(result)

    expect(sent()).toStrictEqual([ORDERS_QUERY])
    expect(editingOf(result.tab)).toMatchObject({
      rows: [{ row: 0, isDeleted: true }],
      notice: 'Nothing was applied: the deletion was not confirmed.',
      isNoticeError: true,
    })
  })

  it('should ask for the name of a production connection, then for the number of rows it deletes', async () => {
    harness.connections.set('shop', { ...SHOP, environment: EnvironmentTag.Production })
    window.showInputBox.mockResolvedValueOnce('Shop').mockResolvedValueOnce('1')
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.Delete, block: cell(1, 0) })

    await previewAndApply(result)

    expect(
      window.showInputBox.mock.calls.map(([options]) => (options as { title: string }).title),
    ).toStrictEqual(['PROD: Shop', 'Delete 1 row of sales.orders'])
    expect(sent()).toContain('COMMIT')
  })

  it('should run nothing on production until its name is typed', async () => {
    harness.connections.set('shop', { ...SHOP, environment: EnvironmentTag.Production })
    window.showInputBox.mockResolvedValue(undefined)
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.Set, block: cell(1, 2), input: 'x' })

    await previewAndApply(result)

    expect(sent()).toStrictEqual([ORDERS_QUERY])
    expect(editingOf(result.tab)).toMatchObject({
      state: 'editable',
      notice: 'Nothing was applied: the changes did not run.',
      rows: [{ row: 1 }],
    })
  })

  it('should let the guard block the changes of a connection made read-only meanwhile', async () => {
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.Set, block: cell(1, 2), input: 'x' })
    harness.connections.set('shop', { ...SHOP, isReadOnly: true })

    await previewAndApply(result)

    expect(sent()).toStrictEqual([ORDERS_QUERY])
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      '"Shop" is read-only: sqldoro did not run this UPDATE. To write, allow writes on the connection first.',
      'Allow Writes…',
    )
    expect(editingOf(result.tab).notice).toBe('Nothing was applied: the changes did not run.')
  })

  it('should join the open transaction of a manual editor in a savepoint, leaving the commit to the user', async () => {
    harness = queryHarness({ transactionMode: TransactionMode.Manual })
    answerOrders(harness)
    harness.engine.status = TransactionStatus.Open
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.Set, block: cell(1, 2), input: 'x' })

    await previewAndApply(result)

    expect(sent()).toStrictEqual([
      'START TRANSACTION',
      ORDERS_QUERY,
      'SAVEPOINT sqldoro_edits',
      UPDATE_NOTE,
      'RELEASE SAVEPOINT sqldoro_edits',
      ORDERS_QUERY,
    ])
    expect(editingOf(result.tab).notice).toBe(
      'Applied 1 update on sales.orders. The changes are in the open transaction of this editor: commit it to keep them.',
    )
    expect(harness.transactions.isOpen(result.editor.document.uri.toString())).toBe(true)
  })

  it('should not apply anything in a transaction that failed', async () => {
    harness = queryHarness({ transactionMode: TransactionMode.Manual })
    answerOrders(harness)
    const result = await editableResult(harness)
    harness.engine.status = TransactionStatus.Failed
    await harness.transactions.afterStatement(
      {
        uri: result.editor.document.uri.toString(),
        session: harness.engine.session(),
        place: 'x',
        isReadOnly: false,
      },
      { category: 'read', isSucceeded: false },
    )
    await edit(result, { kind: EditKind.Set, block: cell(1, 2), input: 'x' })

    await previewAndApply(result)

    expect(sent()).toStrictEqual(['START TRANSACTION', ORDERS_QUERY])
    expect(editingOf(result.tab).notice).toBe(
      'Nothing was applied: The transaction of this editor failed: roll it back before applying changes.',
    )
  })

  it('should apply nothing once the editor is closed', async () => {
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.Set, block: cell(1, 2), input: 'x' })
    for (const document of [...documents]) {
      closeDocument(document)
    }

    await previewAndApply(result)

    expect(sent()).toStrictEqual([ORDERS_QUERY])
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'The editor of this result is closed: run the query again.',
    )
    expect(editingOf(result.tab)).toMatchObject({ state: 'editable', rows: [{ row: 1 }] })
  })
})
