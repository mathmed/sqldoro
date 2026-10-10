import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { recordingLogger } from '../../../test/fakes/logger.ts'
import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { RESULT_COLUMNS } from '../../../test/fixtures/results.ts'
import { SHOP } from '../../../test/support/query.ts'
import { createWebviewPanel, type FakeWebviewPanel } from '../../../test/vscode.ts'
import { EnvironmentTag } from '../../core/connection/connection.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import type { PanelActions } from './panel-actions.ts'
import { ResultsPanel } from './results-panel.ts'

let webviewPanel: FakeWebviewPanel
let actions: { [K in keyof PanelActions]: ReturnType<typeof vi.fn> }
let log: ReturnType<typeof recordingLogger>
let now: number
let title: string

function panel(): ResultsPanel {
  webviewPanel = createWebviewPanel('sqldoro.results', 'Results', {}, {})
  return new ResultsPanel(
    webviewPanel as unknown as vscode.WebviewPanel,
    actions as unknown as PanelActions,
    {
      now: () => now,
      log,
      title: () => title,
    },
  )
}

function tab(id = 't1'): ResultSet {
  const result = new ResultSet({
    id,
    sql: 'SELECT id, name FROM orders',
    kind: 'rows',
    canServerView: true,
    canRefresh: false,
  })
  result.describe(RESULT_COLUMNS)
  result.addRows([
    ['2', 'b'.repeat(1500)],
    ['1', null],
  ])
  result.succeed({ durationMs: 1, affectedRows: null, isTruncated: false, autoLimit: null })
  return result
}

function posted(): Record<string, unknown>[] {
  return webviewPanel.webview.posted as Record<string, unknown>[]
}

beforeEach(() => {
  actions = {
    cancel: vi.fn(),
    serverView: vi.fn(),
    loadAll: vi.fn(),
    refresh: vi.fn(),
    filterTable: vi.fn(),
    copy: vi.fn(),
    export: vi.fn(),
    copyColumnName: vi.fn(),
    applyEdits: vi.fn(),
    isInOpenTransaction: vi.fn(() => false),
  }
  log = recordingLogger()
  now = 1000
  title = 'Results'
})

describe('ResultsPanel and its connection', () => {
  const POLICY = { productionEnvironments: new Set(['prod']) }
  const PROD = { ...SHOP, environment: EnvironmentTag.Production }

  it('should show the connection of its editor, and spell production out in its title', async () => {
    const sut = panel()

    sut.showConnection(PROD, POLICY)
    await sut.receive({ type: 'ready' })

    expect(webviewPanel.title).toBe('Results · PROD')
    expect(posted()[0]).toStrictEqual({
      type: 'connection',
      connection: { name: 'Shop', environment: 'prod', isProduction: true, isReadOnly: false },
    })
    sut.showConnection(SHOP, POLICY)
    expect(webviewPanel.title).toBe('Results')
    expect(posted().at(-1)).toMatchObject({ connection: { environment: '', isProduction: false } })
  })

  it('should show its connection again when it changes, and ignore the others', async () => {
    const sut = panel()
    sut.showConnection(SHOP, POLICY)
    await sut.receive({ type: 'ready' })

    sut.followConnection([{ ...SHOP, id: 'other', isReadOnly: true }], POLICY)
    expect(posted()).toHaveLength(2)
    sut.followConnection([{ ...PROD, isReadOnly: true }], POLICY)

    expect(webviewPanel.title).toBe('Results · PROD')
    expect(posted().at(-1)).toStrictEqual({
      type: 'connection',
      connection: { name: 'Shop', environment: 'prod', isProduction: true, isReadOnly: true },
    })
  })

  it('should name itself as its source is named now', () => {
    const sut = panel()
    sut.showConnection(PROD, POLICY)

    title = 'Store/shop/sales.orders'
    sut.followConnection([{ ...PROD, name: 'Store' }], POLICY)

    expect(webviewPanel.title).toBe('Store/shop/sales.orders · PROD')
  })

  it('should show no connection before its editor runs', () => {
    const sut = panel()

    sut.followConnection([SHOP], POLICY)

    expect(webviewPanel.title).toBe('Results')
  })

  it('should load every row of a finished tab when asked', async () => {
    const sut = panel()
    sut.startRun(POSTGRES_DIALECT)
    const finished = tab()
    const running = new ResultSet({
      id: 't2',
      sql: 'SELECT 1',
      kind: 'rows',
      canServerView: false,
      canRefresh: false,
    })
    sut.addTab(finished)
    sut.addTab(running)

    await sut.receive({ type: 'loadAll', tabId: 't1' })
    await sut.receive({ type: 'loadAll', tabId: 't2' })
    await sut.receive({ type: 'loadAll', tabId: 'gone' })

    expect(actions.loadAll.mock.calls).toStrictEqual([[finished]])
  })
})

describe('ResultsPanel', () => {
  it('should post nothing before the webview is ready, then every tab of the run', async () => {
    const sut = panel()
    sut.startRun(POSTGRES_DIALECT)
    sut.addTab(tab())

    expect(posted()).toStrictEqual([])
    await sut.receive({ type: 'ready' })
    await expect(sut.whenReady).resolves.toBeUndefined()

    expect(posted()).toMatchObject([
      { type: 'tabs', tabs: [{ id: 't1', rowCount: 2 }], activeTabId: 't1' },
    ])
  })

  it('should replace the tabs of the previous run', async () => {
    const sut = panel()
    await sut.receive({ type: 'ready' })
    sut.startRun(POSTGRES_DIALECT)
    sut.addTab(tab())

    sut.startRun(POSTGRES_DIALECT)

    expect(posted().at(-1)).toStrictEqual({ type: 'tabs', tabs: [], activeTabId: null })
    expect(sut.tab('t1')).toBeUndefined()
  })

  it('should send progress at most every 100 ms, and what is urgent at once', async () => {
    const sut = panel()
    await sut.receive({ type: 'ready' })
    const result = tab()
    sut.addTab(result)

    now += 50
    sut.updateTab(result, false)
    now += 60
    sut.updateTab(result, false)
    sut.updateTab(result, true)

    expect(posted().filter((message) => message['type'] === 'tab')).toHaveLength(3)
  })

  it('should send the window of rows asked for the current view, long text cut', async () => {
    const sut = panel()
    await sut.receive({ type: 'ready' })
    sut.addTab(tab())

    await sut.receive({ type: 'fetchRows', tabId: 't1', viewVersion: 0, start: 0, count: 10 })
    await sut.receive({ type: 'fetchRows', tabId: 't1', viewVersion: 3, start: 0, count: 10 })
    await sut.receive({ type: 'fetchRows', tabId: 'gone', viewVersion: 0, start: 0, count: 10 })

    const rows = posted().filter((message) => message['type'] === 'rows')
    expect(rows).toStrictEqual([
      {
        type: 'rows',
        tabId: 't1',
        viewVersion: 0,
        start: 0,
        rows: [
          { cells: ['2', 'b'.repeat(1000)], truncated: [1] },
          { cells: ['1', null], truncated: [] },
        ],
      },
    ])
  })

  it('should send the whole value of a cell of the current view', async () => {
    const sut = panel()
    await sut.receive({ type: 'ready' })
    sut.addTab(tab())

    await sut.receive({ type: 'fetchCell', tabId: 't1', viewVersion: 0, row: 0, column: 1 })
    await sut.receive({ type: 'fetchCell', tabId: 't1', viewVersion: 9, row: 0, column: 1 })

    expect(posted().filter((message) => message['type'] === 'cell')).toStrictEqual([
      { type: 'cell', tabId: 't1', viewVersion: 0, row: 0, column: 1, value: 'b'.repeat(1500) },
    ])
  })

  it('should sort and filter the rows here, or hand the view to the server', async () => {
    const sut = panel()
    await sut.receive({ type: 'ready' })
    const result = tab()
    sut.addTab(result)
    const view = { sort: [{ column: 0, isDescending: false }], filters: [] }

    await sut.receive({ type: 'setView', tabId: 't1', view, isServerSide: false })
    await sut.receive({ type: 'setView', tabId: 't1', view, isServerSide: true })
    await sut.receive({ type: 'setView', tabId: 'gone', view, isServerSide: false })

    expect(result.rows(0, 2)).toStrictEqual([
      ['1', null],
      ['2', 'b'.repeat(1500)],
    ])
    expect(posted().at(-1)).toMatchObject({ type: 'tab', tab: { viewVersion: 1 } })
    expect(actions.serverView).toHaveBeenCalledExactlyOnceWith(result, view)
  })

  it('should not change the view of a statement that still runs', async () => {
    const sut = panel()
    const running = new ResultSet({
      id: 't2',
      sql: 'SELECT 1',
      kind: 'rows',
      canServerView: true,
      canRefresh: false,
    })
    sut.addTab(running)

    await sut.receive({
      type: 'setView',
      tabId: 't2',
      view: { sort: [], filters: [] },
      isServerSide: true,
    })

    expect(actions.serverView).not.toHaveBeenCalled()
    expect(running.viewVersion).toBe(0)
  })

  it('should copy the cells of the current view with the dialect of the run', async () => {
    const sut = panel()
    const result = tab()
    const range = { firstRow: 0, lastRow: 1, firstColumn: 0, lastColumn: 0 }
    sut.addTab(result)

    await sut.receive({ type: 'copy', tabId: 't1', viewVersion: 0, range, format: 'csv' })
    sut.startRun(POSTGRES_DIALECT)
    sut.addTab(result)
    await sut.receive({ type: 'copy', tabId: 't1', viewVersion: 5, range, format: 'csv' })
    await sut.receive({ type: 'copy', tabId: 't1', viewVersion: 0, range, format: 'csv' })

    expect(actions.copy).toHaveBeenCalledExactlyOnceWith(
      result,
      { range, format: 'csv' },
      POSTGRES_DIALECT,
    )
  })

  it('should export a tab of the run', async () => {
    const sut = panel()
    const result = tab()
    sut.addTab(result)

    await sut.receive({ type: 'export', tabId: 't1', format: 'json' })
    sut.startRun(POSTGRES_DIALECT)
    sut.addTab(result)
    await sut.receive({ type: 'export', tabId: 'gone', format: 'json' })
    await sut.receive({ type: 'export', tabId: 't1', format: 'json' })

    expect(actions.export).toHaveBeenCalledExactlyOnceWith(result, 'json', POSTGRES_DIALECT)
  })

  it('should cancel, and log what the webview reports', async () => {
    const sut = panel()

    await sut.receive({ type: 'cancel' })
    await sut.receive({ type: 'problem', message: 'boom' })

    expect(actions.cancel).toHaveBeenCalledOnce()
    expect(log.warn).toHaveBeenCalledWith('The result view had a problem: boom')
  })

  it('should log a message it cannot read and let other errors through', async () => {
    const sut = panel()
    const exploding = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('storage failure')
        },
      },
    )

    await sut.receive({ type: 'fetchRows' })

    expect(log.warn).toHaveBeenCalledWith(
      'The result view sent a message sqldoro cannot read: "count" must be a whole number of 0 or more',
    )
    await expect(sut.receive(exploding)).rejects.toThrow('storage failure')
  })

  it('should reveal its panel beside the editor without taking the focus', () => {
    const sut = panel()

    sut.reveal()

    expect(webviewPanel.reveal).toHaveBeenCalledWith(undefined, true)
    expect(sut.panel).toBe(webviewPanel)
  })
})
