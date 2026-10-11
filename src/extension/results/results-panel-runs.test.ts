import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { recordingLogger } from '../../../test/fakes/logger.ts'
import { type FakePanelActions, fakePanelActions } from '../../../test/fakes/panel-actions.ts'
import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { createWebviewPanel, type FakeWebviewPanel } from '../../../test/vscode.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { ResultsPanel } from './results-panel.ts'

let webviewPanel: FakeWebviewPanel
let actions: FakePanelActions

function panel(): ResultsPanel {
  webviewPanel = createWebviewPanel('sqldoro.results', 'orders — sales', {}, {})
  return new ResultsPanel(webviewPanel as unknown as vscode.WebviewPanel, actions, {
    now: () => 0,
    log: recordingLogger(),
    title: () => 'orders — sales',
  })
}

// A tab of the rows of a table (which can be read again) or of a query, finished or still running.
function tab(id: string, { canRefresh = false, isRunning = false } = {}): ResultSet {
  const result = new ResultSet({
    values: [],
    id,
    sql: 'SELECT * FROM "sales"."orders"',
    kind: 'rows',
    canServerView: true,
    canRefresh,
  })
  if (!isRunning) {
    result.succeed({ durationMs: 1, affectedRows: null, isTruncated: false, autoLimit: null })
  }
  return result
}

beforeEach(() => {
  actions = fakePanelActions()
})

describe('ResultsPanel and the runs of its tabs', () => {
  it('should read again only the finished tabs made to be read again', async () => {
    const sut = panel()
    sut.startRun(POSTGRES_DIALECT)
    const table = tab('t1', { canRefresh: true })
    for (const added of [table, tab('t2'), tab('t3', { canRefresh: true, isRunning: true })]) {
      sut.addTab(added)
    }

    for (const tabId of ['t1', 't2', 't3', 'gone']) {
      await sut.receive({ type: 'refresh', tabId })
    }

    expect(actions.refresh.mock.calls).toStrictEqual([[table]])
  })

  it('should read again with a condition only the finished tabs of tables', async () => {
    const sut = panel()
    sut.startRun(POSTGRES_DIALECT)
    const table = tab('t1', { canRefresh: true })
    for (const added of [table, tab('t2'), tab('t3', { canRefresh: true, isRunning: true })]) {
      sut.addTab(added)
    }

    for (const tabId of ['t1', 't2', 't3', 'gone']) {
      await sut.receive({ type: 'filterTable', tabId, condition: 'id > 1' })
    }

    expect(actions.filterTable.mock.calls).toStrictEqual([[table, 'id > 1']])
  })

  it('should search the rows of a finished tab here, and leave a running one alone', async () => {
    const sut = panel()
    await sut.receive({ type: 'ready' })
    const result = tab('t1')
    result.restart({ sort: [], filters: [] })
    result.addRows([
      ['2', 'b'],
      ['1', null],
    ])
    result.succeed({ durationMs: 1, affectedRows: null, isTruncated: false, autoLimit: null })
    const running = new ResultSet({
      values: [],
      id: 't2',
      sql: 'SELECT 1',
      kind: 'rows',
      canServerView: false,
      canRefresh: false,
    })
    sut.addTab(result)
    sut.addTab(running)

    await sut.receive({ type: 'search', tabId: 't1', text: 'B' })
    await sut.receive({ type: 'search', tabId: 't2', text: 'B' })
    await sut.receive({ type: 'search', tabId: 'gone', text: 'B' })

    expect(result.rows(0, 5)).toStrictEqual([['2', 'b']])
    expect(webviewPanel.webview.posted.at(-1)).toMatchObject({
      type: 'tab',
      tab: { id: 't1', search: 'B' },
    })
    expect(running.searchText).toBe('')
  })

  it('should copy the name of a column of a tab of the run', async () => {
    const sut = panel()
    const result = tab('t1')
    sut.addTab(result)

    await sut.receive({ type: 'copyColumnName', tabId: 't1', column: 1 })
    await sut.receive({ type: 'copyColumnName', tabId: 'gone', column: 1 })

    expect(actions.copyColumnName).toHaveBeenCalledExactlyOnceWith(result, 1)
  })

  it('should fail the tabs a run left running, with what stopped it', async () => {
    const sut = panel()
    await sut.receive({ type: 'ready' })
    const finished = tab('t1')
    const running = tab('t2', { canRefresh: true, isRunning: true })
    sut.addTab(finished)
    sut.addTab(running)

    sut.failRunning('connection refused')

    expect(running.toTab()).toMatchObject({
      status: 'failed',
      error: { message: 'connection refused', line: null, column: null },
    })
    expect(finished.toTab().status).toBe('succeeded')
    expect(webviewPanel.webview.posted.at(-1)).toMatchObject({
      type: 'tab',
      tab: { id: 't2', status: 'failed' },
    })
  })
})
