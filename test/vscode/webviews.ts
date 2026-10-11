// Webview panels and views whose page the tests read and whose messages they play in both
// directions.
import { vi } from 'vitest'

import type { FakeUri } from './uri.ts'

type Listener<T> = (event: T) => unknown

class Emitter<T> {
  readonly #listeners = new Set<Listener<T>>()

  readonly event = (listener: Listener<T>): { dispose: () => void } => {
    this.#listeners.add(listener)
    return {
      dispose: () => {
        this.#listeners.delete(listener)
      },
    }
  }

  fire(data: T): void {
    for (const listener of [...this.#listeners]) {
      listener(data)
    }
  }
}

export class FakeWebview {
  html = ''
  readonly cspSource = 'vscode-webview-resource:'
  options: unknown
  readonly posted: unknown[] = []
  readonly #messages = new Emitter<unknown>()
  readonly onDidReceiveMessage = this.#messages.event

  constructor(options: unknown) {
    this.options = options
  }

  asWebviewUri(uri: FakeUri): string {
    return `webview:${uri.path}`
  }

  async postMessage(message: unknown): Promise<boolean> {
    this.posted.push(message)
    return Promise.resolve(true)
  }

  // What the page would send to the extension.
  send(message: unknown): void {
    this.#messages.fire(message)
  }
}

// What closes once, and says so.
class FakeDisposable {
  isDisposed = false
  readonly #disposed = new Emitter<undefined>()
  readonly onDidDispose = this.#disposed.event

  dispose(): void {
    if (!this.isDisposed) {
      this.isDisposed = true
      this.#disposed.fire(undefined)
    }
  }
}

export class FakeWebviewPanel extends FakeDisposable {
  readonly viewType: string
  title: string
  readonly showOptions: unknown
  readonly webview: FakeWebview
  readonly reveal = vi.fn()

  constructor(
    viewType: string,
    title: string,
    { showOptions, options }: { showOptions: unknown; options: unknown },
  ) {
    super()
    this.viewType = viewType
    this.title = title
    this.showOptions = showOptions
    this.webview = new FakeWebview(options)
  }
}

export const webviewPanels: FakeWebviewPanel[] = []

// A webview view of a view container (the search box above the Connections view): VS Code makes
// it when it shows the view, and drops it (dispose) while the view is hidden.
export class FakeWebviewView extends FakeDisposable {
  readonly viewType: string
  readonly webview = new FakeWebview(undefined)

  constructor(viewType: string) {
    super()
    this.viewType = viewType
  }
}

interface WebviewViewProvider {
  readonly resolveWebviewView: (view: FakeWebviewView, context: unknown, token: unknown) => unknown
}

const webviewViewProviders = new Map<string, WebviewViewProvider>()
// The views VS Code shows now, by view id.
export const webviewViews = new Map<string, FakeWebviewView>()

export function registerWebviewViewProvider(
  viewId: string,
  provider: WebviewViewProvider,
): { dispose: () => void } {
  webviewViewProviders.set(viewId, provider)
  return {
    dispose: () => {
      webviewViewProviders.delete(viewId)
    },
  }
}

export function hasWebviewView(viewId: string): boolean {
  return webviewViewProviders.has(viewId)
}

// Shows a webview view, as VS Code does when it becomes visible: its provider fills it.
export function showWebviewView(viewId: string): FakeWebviewView | undefined {
  const provider = webviewViewProviders.get(viewId)
  if (provider === undefined) {
    return undefined
  }
  const shown = webviewViews.get(viewId)
  if (shown !== undefined && !shown.isDisposed) {
    return shown
  }
  const view = new FakeWebviewView(viewId)
  webviewViews.set(viewId, view)
  void provider.resolveWebviewView(view, { state: undefined }, {})
  return view
}

export function resetWebviewViews(): void {
  webviewViewProviders.clear()
  webviewViews.clear()
}

export function createWebviewPanel(
  ...[viewType, title, showOptions, options]: [string, string, unknown, unknown]
): FakeWebviewPanel {
  const panel = new FakeWebviewPanel(viewType, title, { showOptions, options })
  webviewPanels.push(panel)
  return panel
}
