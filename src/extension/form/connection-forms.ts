import * as vscode from 'vscode'

import { FormMode } from '../../core/connection-form/protocol.ts'
import { describeError } from '../../core/text/errors.ts'
import { bundleOf, createNonce, webviewHtml, webviewRoot } from '../webview-page.ts'
import { ConnectionFormPanel } from './connection-form-panel.ts'
import type { FormRequest, FormServices } from './form-request.ts'

export interface ConnectionFormsDependencies extends FormServices {
  readonly extensionUri: vscode.Uri
}

const VIEW_TYPE = 'sqldoro.connectionForm'
const BUNDLE = 'connection-form'
const NEW_TITLE = 'New Connection'
// The key of the form of a new connection; the others are keyed by their connection.
const NEW_FORM = 'new'

function keyOf(connectionId: string): string {
  return `connection:${connectionId}`
}

function titleOf({ mode, connection }: FormRequest): string {
  return mode === FormMode.Edit ? `Edit Connection: ${connection.name}` : NEW_TITLE
}

// The connection forms, in the editor area: one per connection, and one for a new connection. A
// second request for a form that is open brings it to the front, with what was typed in it.
export class ConnectionForms implements vscode.Disposable {
  readonly #dependencies: ConnectionFormsDependencies
  readonly #forms = new Map<string, ConnectionFormPanel>()

  constructor(dependencies: ConnectionFormsDependencies) {
    this.#dependencies = dependencies
  }

  // The form of a new connection: the request is only made when no such form is open.
  openNew(request: () => FormRequest): ConnectionFormPanel {
    return this.#reveal(NEW_FORM) ?? this.#open(NEW_FORM, request())
  }

  // The form of a connection being edited, or imported from a URL.
  open(request: FormRequest): ConnectionFormPanel {
    const key = keyOf(request.connection.id)
    return this.#reveal(key) ?? this.#open(key, request)
  }

  dispose(): void {
    for (const form of [...this.#forms.values()]) {
      form.panel.dispose()
    }
  }

  #reveal(key: string): ConnectionFormPanel | undefined {
    const form = this.#forms.get(key)
    form?.reveal()
    return form
  }

  #open(key: string, request: FormRequest): ConnectionFormPanel {
    const panel = createPanel(this.#dependencies.extensionUri, titleOf(request))
    const form = new ConnectionFormPanel(panel, request, this.#dependencies)
    const listening = panel.webview.onDidReceiveMessage((data: unknown) => {
      form.receive(data).catch((error: unknown) => {
        const message = `The connection form failed: ${describeError(error)}`
        this.#dependencies.log.error(message)
        void vscode.window.showErrorMessage(message)
      })
    })
    panel.onDidDispose(() => {
      listening.dispose()
      form.close()
      this.#forms.delete(key)
    })
    this.#forms.set(key, form)
    return form
  }
}

// A small form: it keeps its state while hidden, so that what was typed survives a tab switch.
function createPanel(extensionUri: vscode.Uri, title: string): vscode.WebviewPanel {
  const root = webviewRoot(extensionUri)
  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    title,
    { viewColumn: vscode.ViewColumn.Active },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [root] },
  )
  panel.webview.html = webviewHtml(
    panel.webview,
    { title, bundle: bundleOf(root, BUNDLE) },
    createNonce(),
  )
  return panel
}
