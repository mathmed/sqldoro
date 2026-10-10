import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { answerOrders, cell, edit, editingOf } from '../../../test/support/edits.ts'
import { CRM, type HarnessOptions, SHOP } from '../../../test/support/query.ts'
import {
  objectNode,
  openTable,
  type TableHarness,
  tableHarness,
  type TableResult,
} from '../../../test/support/tables.ts'
import { resetVscode, Uri, webviewPanels, window } from '../../../test/vscode.ts'
import { EditKind } from '../../core/edits/edit-kind.ts'
import { ColumnKind } from '../../core/engine/query.ts'
import { TableFilterProblem } from '../../core/results/table-data.ts'
import { filterTable } from './table-filter.ts'

const ORDERS_SQL = 'SELECT * FROM "sales"."orders"'
const OPEN_SQL = `${ORDERS_SQL} WHERE (note IS NOT NULL\n)`
const NAME = { name: 'name', dataType: 'TEXT', kind: ColumnKind.Text }

let harness: TableHarness

function sent(): string[] {
  return harness.engine.requests.map((request) => request.sql)
}

async function openWith(options: HarnessOptions): Promise<TableResult> {
  harness.dispose()
  harness = await tableHarness(options)
  answerOrders(harness)
  return openTable(harness)
}

// What the WHERE input of the result view sends, and the end of the read it starts.
async function filter({ panel, tab }: TableResult, condition: string): Promise<void> {
  const reads = harness.engine.requests.length
  panel.webview.send({ type: 'filterTable', tabId: tab.id, condition })
  await vi.waitFor(() => {
    expect(harness.engine.requests.length).toBeGreaterThan(reads)
    expect(tab.isRunning).toBe(false)
  })
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

describe('the WHERE of a table panel', () => {
  it('should read the rows that meet the condition, through the guards, out of the history', async () => {
    const result = await openTable(harness)

    await filter(result, '  note IS NOT NULL ')

    expect(sent()).toStrictEqual([ORDERS_SQL, OPEN_SQL])
    expect(result.tab.toTab()).toMatchObject({
      sql: OPEN_SQL,
      tableFilter: 'note IS NOT NULL',
      status: 'succeeded',
    })
    expect(harness.log.debug).toHaveBeenCalledWith('Guard: allowed SELECT on "Shop"')
    expect(harness.records).toStrictEqual([])
  })

  it('should read every row again once the condition is cleared', async () => {
    const result = await openTable(harness)
    await filter(result, 'note IS NOT NULL')

    await filter(result, '')

    expect(sent()).toStrictEqual([ORDERS_SQL, OPEN_SQL, ORDERS_SQL])
    expect(result.tab.toTab()).toMatchObject({ sql: ORDERS_SQL, tableFilter: '' })
  })

  it('should keep the rows editable, with the condition in place', async () => {
    const result = await openTable(harness)

    await filter(result, 'note IS NOT NULL')

    await vi.waitFor(() => {
      expect(editingOf(result.tab)).toMatchObject({ state: 'editable', table: 'sales.orders' })
    })
  })

  it('should give a new condition the automatic limit, and keep it on Refresh and Load All', async () => {
    const result = await openWith({ autoLimit: 1 })
    result.panel.webview.send({ type: 'loadAll', tabId: result.tab.id })
    await vi.waitFor(() => {
      expect(sent()).toHaveLength(2)
      expect(result.tab.isRunning).toBe(false)
    })

    await filter(result, 'note IS NOT NULL')
    result.panel.webview.send({ type: 'refresh', tabId: result.tab.id })
    await vi.waitFor(() => {
      expect(sent()).toHaveLength(4)
      expect(result.tab.isRunning).toBe(false)
    })
    result.panel.webview.send({ type: 'loadAll', tabId: result.tab.id })

    await vi.waitFor(() => {
      expect(sent()).toStrictEqual([
        `${ORDERS_SQL} LIMIT 2`,
        ORDERS_SQL,
        `${OPEN_SQL} LIMIT 2`,
        `${OPEN_SQL} LIMIT 2`,
        OPEN_SQL,
      ])
    })
  })

  it('should keep a view sorted here', async () => {
    const result = await openTable(harness)
    const view = { sort: [{ column: 0, isDescending: true }], filters: [] }
    result.panel.webview.send({ type: 'setView', tabId: result.tab.id, view, isServerSide: false })

    await filter(result, 'id > 0')

    expect(result.tab.toTab()).toMatchObject({ view, isServerView: false })
    expect(result.tab.rows(0, 1)[0]?.[0]).toBe(2)
  })

  it('should sort and filter on the server around the condition', async () => {
    const result = await openTable(harness)
    const view = { sort: [], filters: [{ column: 1, text: 'A' }] }
    result.panel.webview.send({ type: 'setView', tabId: result.tab.id, view, isServerSide: true })
    await vi.waitFor(() => {
      expect(sent()).toHaveLength(2)
      expect(result.tab.isRunning).toBe(false)
    })

    await filter(result, 'id > 0')

    expect(sent().at(-1)).toBe(
      `SELECT * FROM (\n${ORDERS_SQL} WHERE (id > 0\n)\n) AS sqldoro_view\nWHERE LOWER(CAST("code" AS TEXT)) LIKE $1`,
    )
    expect(harness.engine.requests.at(-1)?.values).toStrictEqual(['%a%'])
    expect(result.tab.toTab()).toMatchObject({ isServerView: true, view })
  })

  it.each([
    ['id = 1; DELETE FROM sales.orders', TableFilterProblem.Statements],
    ["note = 'open", TableFilterProblem.Unclosed],
    ['id = 1) OR (true', TableFilterProblem.Parentheses],
  ])('should refuse %j and leave the rows as they were', async (condition, problem) => {
    const result = await openTable(harness)

    result.panel.webview.send({ type: 'filterTable', tabId: result.tab.id, condition })

    await vi.waitFor(() => {
      expect(window.showWarningMessage).toHaveBeenCalledWith(problem)
    })
    expect(sent()).toStrictEqual([ORDERS_SQL])
    expect(result.tab.toTab()).toMatchObject({ sql: ORDERS_SQL, tableFilter: '', loadedRows: 2 })
  })

  it('should let the guards refuse a condition that writes on a read-only connection', async () => {
    const result = await openTable(harness)
    harness.connections.set(SHOP.id, { ...SHOP, isReadOnly: true })
    window.showErrorMessage.mockResolvedValue(undefined)

    result.panel.webview.send({
      type: 'filterTable',
      tabId: result.tab.id,
      condition: "nextval('orders_id_seq') > 0",
    })

    await vi.waitFor(() => {
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        '"Shop" is read-only: sqldoro did not run this SELECT (it calls nextval). To write, allow writes on the connection first.',
        'Allow Writes…',
      )
    })
    expect(window.showErrorMessage).toHaveBeenCalledOnce()
    expect(sent()).toStrictEqual([ORDERS_SQL])
    expect(result.tab.toTab()).toMatchObject({ sql: ORDERS_SQL, tableFilter: '' })
  })

  it('should keep the changes of the rows instead of reading them with a condition', async () => {
    const result = await openTable(harness)
    await vi.waitFor(() => {
      expect(editingOf(result.tab).state).toBe('editable')
    })
    await edit(result, { kind: EditKind.Set, range: cell(1, 2), input: 'birthday' })

    result.panel.webview.send({ type: 'filterTable', tabId: result.tab.id, condition: 'id > 1' })

    expect(editingOf(result.tab)).toMatchObject({
      notice:
        'Apply or revert the changes first: running the query again would read the rows again and drop them.',
      isNoticeError: true,
    })
    expect(sent()).toStrictEqual([ORDERS_SQL])
  })

  it('should quote a MySQL table its own way', async () => {
    harness.engine.answer = () => ({ columns: [NAME], rows: [['a']] })
    const customers = { database: 'crm', schema: 'crm', name: 'customers' }
    const result = await openTable(
      harness,
      objectNode(customers, { kind: 'table', connectionId: CRM.id }),
    )

    await filter(result, 'name LIKE "a%" # names with a')

    expect(sent().at(-1)).toBe(
      'SELECT * FROM `crm`.`customers` WHERE (name LIKE "a%" # names with a\n)',
    )
  })

  it('should read nothing for a source that is not a table', async () => {
    const result = await openTable(harness)
    const document = Uri.parse('untitled:Untitled-1') as unknown as vscode.Uri

    await filterTable(harness.runner, document, { tab: result.tab, condition: 'id > 1' })

    expect(sent()).toStrictEqual([ORDERS_SQL])
  })
})
