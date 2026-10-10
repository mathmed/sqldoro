import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { answerOrders, cell, edit, editingOf } from '../../../test/support/edits.ts'
import { CRM, readyPanel, SHOP, sqlEditor } from '../../../test/support/query.ts'
import {
  objectNode,
  openTable,
  type TableHarness,
  tableHarness,
} from '../../../test/support/tables.ts'
import { resetVscode, webviewPanels, window } from '../../../test/vscode.ts'
import { RunScope } from '../../core/editor/run-plan.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'

const CUSTOMERS = { database: 'crm', schema: 'crm', name: 'customers' }

let harness: TableHarness

beforeEach(async () => {
  resetVscode()
  webviewPanels.length = 0
  window.showWarningMessage.mockReset()
  harness = await tableHarness()
  answerOrders(harness)
})

afterEach(() => {
  harness.dispose()
})

describe('followTablePanels', () => {
  it('should give back the session of a table when its panel closes', async () => {
    const { uri, panel } = await openTable(harness)
    const key = uri.toString()
    expect(harness.editorSessions.existing(key)).toBeDefined()

    panel.dispose()

    expect(harness.editorSessions.existing(key)).toBeUndefined()
    await vi.waitFor(() => {
      expect(harness.closeSession).toHaveBeenCalledOnce()
    })
  })

  it('should leave the session of an editor to its document when its results close', async () => {
    const editor = await sqlEditor(harness, 'SELECT 1')
    const panel = readyPanel(harness, editor)
    await harness.runner.run(editor as unknown as vscode.TextEditor, RunScope.All)

    panel.dispose()

    expect(harness.editorSessions.existing(editor.document.uri.toString())).toBeDefined()
    expect(harness.closeSession).not.toHaveBeenCalled()
  })

  it('should close the tables of a connection that is closed, and only those', async () => {
    const shop = await openTable(harness)
    const crm = await openTable(
      harness,
      objectNode(CUSTOMERS, { kind: 'table', connectionId: CRM.id }),
    )
    const editor = readyPanel(harness, await sqlEditor(harness, 'SELECT 1'))

    await harness.sessions.disconnect(SHOP.id)

    expect([shop.panel, crm.panel, editor].map((panel) => panel.isDisposed)).toStrictEqual([
      true,
      false,
      false,
    ])
  })

  it('should keep the tables of a connection that opens', async () => {
    const { panel } = await openTable(harness)

    await harness.sessions.connect(SHOP)

    expect(panel.isDisposed).toBe(false)
  })

  it('should close the tables of a deleted connection', async () => {
    const shop = await openTable(harness)
    const crm = await openTable(
      harness,
      objectNode(CUSTOMERS, { kind: 'table', connectionId: CRM.id }),
    )

    await harness.store.save({ ...CRM, name: 'Customers' })
    expect(shop.panel.isDisposed).toBe(false)
    await harness.store.delete(SHOP.id)

    expect([shop.panel.isDisposed, crm.panel.isDisposed]).toStrictEqual([true, false])
  })

  it('should warn, by the name of the table, of the changes its closed panel took away', async () => {
    const result = await openTable(harness)
    await vi.waitFor(() => {
      expect(editingOf(result.tab).state).toBe('editable')
    })
    await edit(result, { kind: EditKind.Set, range: cell(1, 2), input: 'birthday' })

    await harness.sessions.disconnect(SHOP.id)

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'The changes in the results of orders — sales were not applied: their view was closed.',
    )
  })

  it('should open a table again on a new session once its panel closed', async () => {
    const first = await openTable(harness)
    first.panel.dispose()
    await vi.waitFor(() => {
      expect(harness.closeSession).toHaveBeenCalledOnce()
    })

    const second = await openTable(harness)

    expect(second.panel).not.toBe(first.panel)
    expect(harness.opened).toHaveLength(2)
    expect(harness.engine.requests).toHaveLength(2)
  })
})
