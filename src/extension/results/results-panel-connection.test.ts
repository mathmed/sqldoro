import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { recordingLogger } from '../../../test/fakes/logger.ts'
import { type FakePanelActions, fakePanelActions } from '../../../test/fakes/panel-actions.ts'
import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { RESULT_COLUMNS } from '../../../test/fixtures/results.ts'
import { SHOP } from '../../../test/support/query.ts'
import { createWebviewPanel, type FakeWebviewPanel } from '../../../test/vscode.ts'
import { EnvironmentTag } from '../../core/connection/connection.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { ResultsPanel } from './results-panel.ts'

let webviewPanel: FakeWebviewPanel
let actions: FakePanelActions
let log: ReturnType<typeof recordingLogger>
let now: number
let title: string

function panel(): ResultsPanel {
  webviewPanel = createWebviewPanel('sqldoro.results', 'Results', {}, {})
  const opened = webviewPanel as unknown as vscode.WebviewPanel
  const sut = new ResultsPanel({ open: () => opened }, actions, {
    now: () => now,
    log,
    title: () => title,
  })
  sut.reveal()
  return sut
}

function tab(id = 't1'): ResultSet {
  const result = new ResultSet({
    values: [],
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
  actions = fakePanelActions()
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
      connection: {
        name: 'Shop',
        environment: 'prod',
        isProduction: true,
        isReadOnly: false,
        color: 'charts.red',
      },
    })
    sut.showConnection(SHOP, POLICY)
    expect(webviewPanel.title).toBe('Results')
    expect(posted().at(-1)).toMatchObject({ connection: { environment: '', isProduction: false } })
  })

  it('should show its connection again when it changes, and ignore the others', async () => {
    const sut = panel()
    sut.showConnection(SHOP, POLICY)
    await sut.receive({ type: 'ready' })

    const before = posted().length
    sut.followConnection([{ ...SHOP, id: 'other', isReadOnly: true }], POLICY)
    expect(posted()).toHaveLength(before)
    sut.followConnection([{ ...PROD, isReadOnly: true }], POLICY)

    expect(webviewPanel.title).toBe('Results · PROD')
    expect(posted().at(-1)).toStrictEqual({
      type: 'connection',
      connection: {
        name: 'Shop',
        environment: 'prod',
        isProduction: true,
        isReadOnly: true,
        color: 'charts.red',
      },
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
      values: [],
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
