import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { recordingLogger } from '../../../test/fakes/logger.ts'
import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { createWebviewPanel, type FakeWebviewPanel } from '../../../test/vscode.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { type PanelActions, ResultsPanel } from './results-panel.ts'

let webviewPanel: FakeWebviewPanel
let actions: { [K in keyof PanelActions]: ReturnType<typeof vi.fn> }

function panel(): ResultsPanel {
  webviewPanel = createWebviewPanel('sqldoro.results', 'orders — sales', {}, {})
  return new ResultsPanel(
    webviewPanel as unknown as vscode.WebviewPanel,
    actions as unknown as PanelActions,
    { now: () => 0, log: recordingLogger() },
  )
}

// A tab of the rows of a table (which can be read again) or of a query, finished or still running.
function tab(id: string, { canRefresh = false, isRunning = false } = {}): ResultSet {
  const result = new ResultSet({
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
  actions = {
    cancel: vi.fn(),
    serverView: vi.fn(),
    loadAll: vi.fn(),
    refresh: vi.fn(),
    copy: vi.fn(),
    export: vi.fn(),
    applyEdits: vi.fn(),
    isInOpenTransaction: vi.fn(() => false),
  }
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
