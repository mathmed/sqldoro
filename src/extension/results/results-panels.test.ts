import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import type * as vscode from 'vscode'

import { recordingLogger } from '../../../test/fakes/logger.ts'
import { resetVscode, Uri, webviewPanels } from '../../../test/vscode.ts'
import { ResultsPanels } from './results-panels.ts'

const DOCUMENT = Uri.parse('untitled:Untitled-1') as unknown as vscode.Uri
let log: ReturnType<typeof recordingLogger>
let cancel: Mock<() => void>

function panels(): ResultsPanels {
  return new ResultsPanels({
    extensionUri: Uri.file('/ext') as unknown as vscode.Uri,
    now: () => 0,
    log,
    actionsFor: () => ({
      cancel,
      serverView: vi.fn(),
      loadAll: vi.fn(),
      copy: vi.fn(),
      export: vi.fn(),
      applyEdits: vi.fn(),
      isInOpenTransaction: () => false,
    }),
  })
}

beforeEach(() => {
  resetVscode()
  webviewPanels.length = 0
  log = recordingLogger()
  cancel = vi.fn<() => void>()
})

describe('ResultsPanels', () => {
  it('should open one panel per editor beside it, with the page of the result view', () => {
    const sut = panels()

    const first = sut.show(DOCUMENT)
    const again = sut.show(DOCUMENT)

    expect(again).toBe(first)
    expect(sut.get(DOCUMENT)).toBe(first)
    expect(webviewPanels).toHaveLength(1)
    expect(webviewPanels[0]).toMatchObject({
      viewType: 'sqldoro.results',
      title: 'Results: Untitled-1',
      showOptions: { viewColumn: -2, preserveFocus: true },
    })
    expect(webviewPanels[0]?.webview.options).toMatchObject({
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [{ path: '/ext/dist/webview' }],
    })
    expect(webviewPanels[0]?.webview.html).toContain('src="webview:/ext/dist/webview/results.js"')
    expect(webviewPanels[0]?.reveal).toHaveBeenCalledOnce()
  })

  it('should hand the messages of the webview to the panel and log what fails', async () => {
    const sut = panels()
    const panel = sut.show(DOCUMENT)
    vi.spyOn(panel, 'receive').mockRejectedValueOnce(new Error('boom'))

    webviewPanels[0]?.webview.send({ type: 'cancel' })
    webviewPanels[0]?.webview.send({ type: 'cancel' })

    await vi.waitFor(() => {
      expect(log.error).toHaveBeenCalledWith('The result view of untitled:Untitled-1 failed: boom')
    })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('should forget a panel the user closes, and close them all when disposed', () => {
    const sut = panels()
    sut.show(DOCUMENT)

    sut.close(DOCUMENT)
    sut.close(DOCUMENT)

    expect(sut.get(DOCUMENT)).toBeUndefined()
    sut.show(Uri.parse('file:/work/report.sql') as unknown as vscode.Uri)
    sut.dispose()
    expect(webviewPanels.every((panel) => panel.isDisposed)).toBe(true)
  })
})
