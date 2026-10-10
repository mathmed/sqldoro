import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { Logger } from '../../core/platform.ts'
import type { GuardPolicy } from '../../core/safety/guard.ts'
import { describeError } from '../../core/text/errors.ts'
import { documentLabel } from '../editor/document-label.ts'
import { isTableKey } from '../tables/table-uri.ts'
import { bundleOf, createNonce, webviewHtml, webviewRoot } from '../webview-page.ts'
import type { PanelActions } from './panel-actions.ts'
import { type PanelEnvironment, ResultsPanel } from './results-panel.ts'

export interface ResultsPanelsDependencies {
  readonly extensionUri: vscode.Uri
  readonly now: () => number
  readonly log: Logger
  readonly actionsFor: (document: vscode.Uri) => PanelActions
  // The title of the panel of a source, as it is named now.
  readonly titleOf: (source: vscode.Uri) => string
}

const RESULTS_VIEW_TYPE = 'sqldoro.results'
const BUNDLE = 'results'
const PAGE_TITLE = 'Results'

// Where a panel opens: beside its editor, or in place for a table.
function viewColumnOf(uri: vscode.Uri): vscode.ViewColumn {
  return isTableKey(uri.toString()) ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside
}

// The webview of a panel, on the page of the result view: it may only load the bundles.
function createWebview(uri: vscode.Uri, title: string, root: vscode.Uri): vscode.WebviewPanel {
  const webviewPanel = vscode.window.createWebviewPanel(
    RESULTS_VIEW_TYPE,
    title,
    { viewColumn: viewColumnOf(uri), preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [root] },
  )
  webviewPanel.webview.html = webviewHtml(
    webviewPanel.webview,
    { title: PAGE_TITLE, bundle: bundleOf(root, BUNDLE) },
    createNonce(),
  )
  return webviewPanel
}

interface Entry {
  readonly uri: vscode.Uri
  readonly panel: ResultsPanel
}

// One result panel per source: beside each SQL editor, and one per table opened from the explorer.
// It goes when the user closes it or its editor.
export class ResultsPanels implements vscode.Disposable {
  readonly #dependencies: ResultsPanelsDependencies
  readonly #panels = new Map<string, Entry>()
  readonly #closes = new vscode.EventEmitter<vscode.Uri>()
  // The source of a panel that closed.
  readonly onDidClose = this.#closes.event

  constructor(dependencies: ResultsPanelsDependencies) {
    this.#dependencies = dependencies
  }

  get(uri: vscode.Uri): ResultsPanel | undefined {
    return this.#panels.get(uri.toString())?.panel
  }

  show(uri: vscode.Uri): ResultsPanel {
    const existing = this.get(uri)
    if (existing !== undefined) {
      existing.reveal()
      return existing
    }
    const panel = this.#create(uri)
    this.#panels.set(uri.toString(), { uri, panel })
    return panel
  }

  // Each panel shows the connection of its source as it is now.
  followConnections(connections: readonly ConnectionConfig[], policy: GuardPolicy): void {
    for (const { panel } of this.#panels.values()) {
      panel.followConnection(connections, policy)
    }
  }

  close(uri: vscode.Uri): void {
    this.get(uri)?.panel.dispose()
  }

  // Closes the panels whose source is one of these.
  closeWhere(isClosing: (uri: vscode.Uri) => boolean): void {
    for (const { uri, panel } of [...this.#panels.values()]) {
      if (isClosing(uri)) {
        panel.panel.dispose()
      }
    }
  }

  dispose(): void {
    this.closeWhere(() => true)
    this.#closes.dispose()
  }

  #create(uri: vscode.Uri): ResultsPanel {
    const { extensionUri, now, log, actionsFor, titleOf } = this.#dependencies
    const title = (): string => titleOf(uri)
    const webviewPanel = createWebview(uri, title(), webviewRoot(extensionUri))
    const environment: PanelEnvironment = { now, log, title }
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
      this.#closes.fire(uri)
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
