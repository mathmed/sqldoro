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
import { type QueryHarness, queryHarness } from '../../../test/support/query.ts'
import { resetVscode, window } from '../../../test/vscode.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'

let harness: QueryHarness

function sent(): string[] {
  return harness.engine.requests.map((request) => request.sql)
}

const BY_ID_DESCENDING = { sort: [{ column: 0, isDescending: true }], filters: [] }

beforeEach(() => {
  resetVscode()
  window.showInformationMessage.mockReset()
  harness = queryHarness()
  answerOrders(harness)
})

describe('applyEdits, reading the rows again', () => {
  it('should keep the sort and filters of the rows here', async () => {
    const result = await editableResult(harness)
    result.panel.webview.send({
      type: 'setView',
      tabId: result.tab.id,
      view: BY_ID_DESCENDING,
      isServerSide: false,
    })
    await expect.poll(() => result.tab.view).toStrictEqual(BY_ID_DESCENDING)
    await edit(result, { kind: EditKind.SetNull, block: cell(0, 2) })

    await previewAndApply(result)

    expect(sent().at(-1)).toBe(ORDERS_QUERY)
    expect(result.tab.view).toStrictEqual(BY_ID_DESCENDING)
    expect(result.tab.isServerView).toBe(false)
  })

  it('should run a view sorted on the server again on the server', async () => {
    const result = await editableResult(harness)
    result.panel.webview.send({
      type: 'setView',
      tabId: result.tab.id,
      view: BY_ID_DESCENDING,
      isServerSide: true,
    })
    await expect.poll(() => result.tab.isServerView).toBe(true)
    await expect.poll(() => editingOf(result.tab).state).toBe('editable')
    await edit(result, { kind: EditKind.SetNull, block: cell(1, 2) })

    await previewAndApply(result)

    expect(sent().at(-1)).toBe(
      `SELECT * FROM (\n${ORDERS_QUERY}\n) AS sqldoro_view\nORDER BY "id" DESC`,
    )
    expect(result.tab.view).toStrictEqual(BY_ID_DESCENDING)
  })

  it('should read the rows again with the automatic limit they were read with', async () => {
    harness = queryHarness({ autoLimit: 5 })
    answerOrders(harness)
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.SetNull, block: cell(1, 2) })

    await previewAndApply(result)

    expect(sent()[0]).toBe(`${ORDERS_QUERY} LIMIT 6`)
    expect(sent().at(-1)).toBe(`${ORDERS_QUERY} LIMIT 6`)
  })

  it('should find out again whether the rows read again can be edited', async () => {
    const result = await editableResult(harness)
    await edit(result, { kind: EditKind.SetNull, block: cell(1, 2) })

    await previewAndApply(result)

    // Twice for the editing, before and after the apply; once for the links, kept since.
    expect(harness.engine.describeTable).toHaveBeenCalledTimes(3)
    await expect
      .poll(() => editingOf(result.tab))
      .toMatchObject({
        state: 'editable',
        notice: 'Applied 1 update on sales.orders.',
      })
  })
})
