import * as vscode from 'vscode'

import type { Logger } from '../../core/platform.ts'
import { describeError } from '../../core/text/errors.ts'
import { createNonce, resultsHtml } from './results-html.ts'
import { type PanelActions, type PanelEnvironment, ResultsPanel } from './results-panel.ts'

export interface ResultsPanelsDependencies {
  readonly extensionUri: vscode.Uri
  readonly now: () => number
  readonly log: Logger
  readonly actionsFor: (document: vscode.Uri) => PanelActions
}

const RESULTS_VIEW_TYPE = 'sqldoro.results'
const WEBVIEW_DIRECTORY = ['dist', 'webview']
const SCRIPT = 'results.js'
const STYLE = 'results.css'

function title(uri: vscode.Uri): string {
  return `Results: ${uri.path.slice(uri.path.lastIndexOf('/') + 1)}`
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
    const root = vscode.Uri.joinPath(extensionUri, ...WEBVIEW_DIRECTORY)
    const webviewPanel = vscode.window.createWebviewPanel(
      RESULTS_VIEW_TYPE,
      title(uri),
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [root] },
    )
    const assets = {
      script: vscode.Uri.joinPath(root, SCRIPT),
      style: vscode.Uri.joinPath(root, STYLE),
    }
    webviewPanel.webview.html = resultsHtml(webviewPanel.webview, assets, createNonce())
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
    })
    return panel
  }
}
