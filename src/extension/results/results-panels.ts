import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { Logger } from '../../core/platform.ts'
import type { GuardPolicy } from '../../core/safety/guard.ts'
import { describeError } from '../../core/text/errors.ts'
import { documentLabel } from '../editor/document-label.ts'
import { bundleOf, createNonce, webviewHtml, webviewRoot } from '../webview-page.ts'
import { type PanelActions, type PanelEnvironment, ResultsPanel } from './results-panel.ts'

export interface ResultsPanelsDependencies {
  readonly extensionUri: vscode.Uri
  readonly now: () => number
  readonly log: Logger
  readonly actionsFor: (document: vscode.Uri) => PanelActions
}

const RESULTS_VIEW_TYPE = 'sqldoro.results'
const BUNDLE = 'results'
const PAGE_TITLE = 'Results'

function title(uri: vscode.Uri): string {
  return `Results: ${documentLabel(uri)}`
}

// One result panel per SQL editor, beside it; it goes when the user closes it or the editor.
export class ResultsPanels implements vscode.Disposable {
  readonly #dependencies: ResultsPanelsDependencies
  readonly #panels = new Map<string, ResultsPanel>()

  constructor(dependencies: ResultsPanelsDependencies) {
    this.#dependencies = dependencies
  }

  get(uri: vscode.Uri): ResultsPanel | undefined {
    return this.#panels.get(uri.toString())
  }

  show(uri: vscode.Uri): ResultsPanel {
    const existing = this.get(uri)
    if (existing !== undefined) {
      existing.reveal()
      return existing
    }
    const panel = this.#create(uri)
    this.#panels.set(uri.toString(), panel)
    return panel
  }

  // Each panel shows the connection of its editor as it is now.
  followConnections(connections: readonly ConnectionConfig[], policy: GuardPolicy): void {
    for (const panel of this.#panels.values()) {
      panel.followConnection(connections, policy)
    }
  }

  close(uri: vscode.Uri): void {
    this.get(uri)?.panel.dispose()
  }

  dispose(): void {
    for (const panel of [...this.#panels.values()]) {
      panel.panel.dispose()
    }
  }

  #create(uri: vscode.Uri): ResultsPanel {
    const { extensionUri, now, log, actionsFor } = this.#dependencies
    const root = webviewRoot(extensionUri)
    const webviewPanel = vscode.window.createWebviewPanel(
      RESULTS_VIEW_TYPE,
      title(uri),
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [root] },
    )
    webviewPanel.webview.html = webviewHtml(
      webviewPanel.webview,
      { title: PAGE_TITLE, bundle: bundleOf(root, BUNDLE) },
      createNonce(),
    )
    const environment: PanelEnvironment = { now, log }
    const panel = new ResultsPanel(webviewPanel, actionsFor(uri), environment)
    const listening = webviewPanel.webview.onDidReceiveMessage((data: unknown) => {
      panel.receive(data).catch((error: unknown) => {
        log.error(`The result view of ${uri.toString()} failed: ${describeError(error)}`)
      })
    })
    webviewPanel.onDidDispose(() => {
      listening.dispose()
      this.#panels.delete(uri.toString())
      warnOfDroppedChanges(panel, uri)
    })
    return panel
  }
}

// VS Code cannot keep a view from closing: the user hears about the changes it took away.
function warnOfDroppedChanges(panel: ResultsPanel, uri: vscode.Uri): void {
  if (panel.hasChanges()) {
    void vscode.window.showWarningMessage(
      `The changes in the results of ${documentLabel(uri)} were not applied: their view was closed.`,
    )
  }
}
