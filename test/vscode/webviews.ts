// Webview panels whose page the tests read and whose messages they play in both directions.
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
  readonly options: unknown
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

export class FakeWebviewPanel {
  readonly viewType: string
  title: string
  readonly showOptions: unknown
  readonly webview: FakeWebview
  readonly reveal = vi.fn()
  isDisposed = false
  readonly #disposed = new Emitter<undefined>()
  readonly onDidDispose = this.#disposed.event

  constructor(
    viewType: string,
    title: string,
    { showOptions, options }: { showOptions: unknown; options: unknown },
  ) {
    this.viewType = viewType
    this.title = title
    this.showOptions = showOptions
    this.webview = new FakeWebview(options)
  }

  dispose(): void {
    if (!this.isDisposed) {
      this.isDisposed = true
      this.#disposed.fire(undefined)
    }
  }
}

export const webviewPanels: FakeWebviewPanel[] = []

export function createWebviewPanel(
  ...[viewType, title, showOptions, options]: [string, string, unknown, unknown]
): FakeWebviewPanel {
  const panel = new FakeWebviewPanel(viewType, title, { showOptions, options })
  webviewPanels.push(panel)
  return panel
}
