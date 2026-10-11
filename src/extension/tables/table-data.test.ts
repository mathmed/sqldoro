import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  answerOrders,
  cell,
  edit,
  editingOf,
  previewAndApply,
} from '../../../test/support/edits.ts'
import { CRM, SHOP } from '../../../test/support/query.ts'
import {
  objectNode,
  openTable,
  ORDERS_REF,
  type TableHarness,
  tableHarness,
  tabOf,
} from '../../../test/support/tables.ts'
import { commands, documents, resetVscode, webviewPanels, window } from '../../../test/vscode.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import { ColumnKind } from '../../core/engine/query.ts'
import { TransactionMode } from '../../core/safety/transaction.ts'
import { CommandId } from '../command-id.ts'

const ORDERS_SQL = 'SELECT * FROM "sales"."orders"'
const UPDATE_NOTE = 'UPDATE "sales"."orders" SET "note" = $1 WHERE "id" = $2 AND "note" = $3'
const NAME = { name: 'name', dataType: 'TEXT', kind: ColumnKind.Text }

let harness: TableHarness

function sent(): string[] {
  return harness.engine.requests.map((request) => request.sql)
}

beforeEach(async () => {
  resetVscode()
  webviewPanels.length = 0
  for (const prompt of [
    window.showInformationMessage,
    window.showErrorMessage,
    window.showWarningMessage,
  ]) {
    prompt.mockReset()
  }
  harness = await tableHarness()
  answerOrders(harness)
})

afterEach(() => {
  harness.dispose()
})

describe('Open Table Data', () => {
  it('should open the rows of a table in a panel of their own, on a session of their own', async () => {
    harness.dispose()
    harness = await tableHarness({ autoLimit: 1000, maxRows: 5000 })
    answerOrders(harness)

    const { panel, tab } = await openTable(harness)

    expect(panel).toMatchObject({
      title: 'Shop/shop/sales.orders',
      showOptions: { viewColumn: -1, preserveFocus: true },
    })
    expect(sent()).toStrictEqual([`${ORDERS_SQL} LIMIT 1001`])
    expect(harness.connect).toHaveBeenCalledWith(SHOP)
    expect(harness.opened.map((request) => request.connection.database)).toStrictEqual(['shop'])
    expect(harness.engine.useScope).toHaveBeenCalledWith({ database: 'shop', schema: 'sales' })
    expect(tab.toTab()).toMatchObject({
      sql: ORDERS_SQL,
      status: 'succeeded',
      loadedRows: 2,
      canRefresh: true,
      canServerView: true,
      summary: { autoLimit: 1000 },
    })
    expect(documents).toStrictEqual([])
  })

  it('should run the read through the guards and keep it out of the history', async () => {
    await openTable(harness)

    expect(harness.log.debug).toHaveBeenCalledWith('Guard: allowed SELECT on "Shop"')
    expect(harness.records).toStrictEqual([])
  })

  it('should show the panel of a table already open instead of reading it again', async () => {
    const { panel } = await openTable(harness)
    panel.reveal.mockClear()

    await commands.executeCommand(CommandId.OpenTableData, objectNode())

    expect(panel.reveal).toHaveBeenCalledOnce()
    expect(webviewPanels).toHaveLength(1)
    expect(sent()).toStrictEqual([ORDERS_SQL])
  })

  it('should read a table opened twice at once only once', async () => {
    await Promise.all([
      commands.executeCommand(CommandId.OpenTableData, objectNode()),
      commands.executeCommand(CommandId.OpenTableData, objectNode()),
    ])

    expect(webviewPanels).toHaveLength(1)
    expect(sent()).toStrictEqual([ORDERS_SQL])
  })

  it('should name a MySQL table by its database', async () => {
    const customers = { database: 'crm', schema: 'crm', name: 'customers' }

    const { panel } = await openTable(
      harness,
      objectNode(customers, { kind: 'table', connectionId: CRM.id }),
    )

    expect(panel.title).toBe('CRM/crm/customers')
    expect(sent()).toStrictEqual(['SELECT * FROM `crm`.`customers`'])
  })

  it('should open the rows of a view', async () => {
    const view = { ...ORDERS_REF, name: 'open_orders' }
    harness.engine.answer = () => ({ columns: [NAME], rows: [['a']] })

    const { panel } = await openTable(
      harness,
      objectNode(view, { kind: 'view', connectionId: SHOP.id }),
    )

    expect(panel.title).toBe('Shop/shop/sales.open_orders')
    expect(sent()).toStrictEqual(['SELECT * FROM "sales"."open_orders"'])
  })

  it('should refuse what is not a table or a view of the explorer', async () => {
    await commands.executeCommand(CommandId.OpenTableData)
    await commands.executeCommand(CommandId.OpenTableData, { kind: 'schema', connectionId: 'shop' })
    await commands.executeCommand(CommandId.OpenTableData, { kind: 'table', connectionId: 'shop' })

    expect(window.showInformationMessage.mock.calls).toStrictEqual([
      ['Open Table Data works on a table or a view of the Connections view.'],
      ['Open Table Data works on a table or a view of the Connections view.'],
      ['Open Table Data works on a table or a view of the Connections view.'],
    ])
    expect(webviewPanels).toStrictEqual([])
  })

  it('should refuse a table whose connection no longer exists', async () => {
    await commands.executeCommand(
      CommandId.OpenTableData,
      objectNode(ORDERS_REF, { kind: 'table', connectionId: 'gone' }),
    )

    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'The connection of this table no longer exists.',
    )
    expect(webviewPanels).toStrictEqual([])
  })
})

describe('the failures of a table panel', () => {
  it('should show the message of the server when the table cannot be read', async () => {
    harness.engine.answer = () => ({ error: new Error('permission denied for table orders') })

    const { tab } = await openTable(harness)

    expect(tab.toTab()).toMatchObject({
      status: 'failed',
      error: { message: 'permission denied for table orders', line: null, column: null },
    })
  })

  it('should show the message of the server when the connection cannot open', async () => {
    harness.connect.mockRejectedValueOnce(new Error('password authentication failed'))

    const { tab } = await openTable(harness)

    expect(tab.toTab()).toMatchObject({
      status: 'failed',
      error: { message: 'password authentication failed' },
    })
    expect(window.showErrorMessage).toHaveBeenCalledWith(
      'Could not run the query: password authentication failed',
    )
    expect(sent()).toStrictEqual([])
  })

  it('should say so when the read could not start', async () => {
    harness.engine.answer = () => ({ isPending: true })
    const first = commands.executeCommand(CommandId.OpenTableData, objectNode())
    await vi.waitFor(() => {
      expect(sent()).toStrictEqual([ORDERS_SQL])
    })
    webviewPanels[0]?.dispose()

    const { uri } = await openTable(harness)

    expect(tabOf(harness, uri).toTab()).toMatchObject({
      status: 'failed',
      error: { message: 'sqldoro did not read the rows of this table: Refresh reads them.' },
    })
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'A query is already running in this editor: cancel it first.',
    )
    await harness.runner.cancel(uri)
    await first
  })
})

describe('the rows of a table panel', () => {
  it('should sort on the server, then read the rows again in the same view on Refresh', async () => {
    harness.dispose()
    harness = await tableHarness({ autoLimit: 1 })
    answerOrders(harness)
    const { panel, tab } = await openTable(harness)
    const view = { sort: [{ column: 0, isDescending: true }], filters: [] }
    const sorted = `${ORDERS_SQL}\nORDER BY "id" DESC LIMIT 2`
    panel.webview.send({ type: 'setView', tabId: tab.id, view, isServerSide: false })
    await vi.waitFor(() => {
      expect(tab.toTab()).toMatchObject({ status: 'succeeded', view, isServerView: true })
    })

    panel.webview.send({ type: 'refresh', tabId: tab.id })

    await vi.waitFor(() => {
      expect(sent()).toStrictEqual([`${ORDERS_SQL} LIMIT 2`, sorted, sorted])
      expect(tab.toTab()).toMatchObject({ status: 'succeeded', view })
    })
    expect(harness.records).toStrictEqual([])
  })

  it('should load every row of a table on Load All Rows', async () => {
    harness.dispose()
    harness = await tableHarness({ autoLimit: 1 })
    answerOrders(harness, () => ({ columns: [NAME], rows: [['a']], isTruncated: true }))
    const { panel, tab } = await openTable(harness)

    panel.webview.send({ type: 'loadAll', tabId: tab.id })

    await vi.waitFor(() => {
      expect(sent()).toStrictEqual([`${ORDERS_SQL} LIMIT 2`, ORDERS_SQL])
    })
  })

  it('should let the rows of a table be edited, applied in a transaction of their own', async () => {
    harness.dispose()
    harness = await tableHarness({ transactionMode: TransactionMode.Manual })
    answerOrders(harness)
    const result = await openTable(harness)
    await vi.waitFor(() => {
      expect(editingOf(result.tab).state).toBe('editable')
    })
    await edit(result, { kind: EditKind.Set, block: cell(1, 2), input: 'birthday' })

    await previewAndApply(result)

    expect(sent()).toStrictEqual([
      ORDERS_SQL,
      'START TRANSACTION',
      UPDATE_NOTE,
      'COMMIT',
      ORDERS_SQL,
    ])
    expect(editingOf(result.tab).notice).toBe('Applied 1 update on sales.orders.')
  })

  it('should keep the rows of a view read-only', async () => {
    harness.engine.tables.forEach((table, key) => {
      harness.engine.tables.set(key, { ...table, kind: 'view' })
    })

    const { tab } = await openTable(harness)

    await vi.waitFor(() => {
      expect(editingOf(tab)).toMatchObject({
        state: 'readOnly',
        problem: 'The rows come from a view: sqldoro only edits the rows of tables.',
      })
    })
  })

  it('should not read the rows again while changes wait to be applied', async () => {
    const result = await openTable(harness)
    await vi.waitFor(() => {
      expect(editingOf(result.tab).state).toBe('editable')
    })
    await edit(result, { kind: EditKind.Set, block: cell(1, 2), input: 'birthday' })

    result.panel.webview.send({ type: 'refresh', tabId: result.tab.id })

    expect(editingOf(result.tab)).toMatchObject({
      notice:
        'Apply or revert the changes first: running the query again would read the rows again and drop them.',
      isNoticeError: true,
    })
    expect(sent()).toStrictEqual([ORDERS_SQL])
  })
})
