import * as vscode from 'vscode'

import type { Logger } from '../../core/platform.ts'
import { parseSearchViewMessage } from '../../core/table-search/parse-view-message.ts'
import {
  type SearchHostMessage,
  SearchHostMessageType,
  type SearchViewMessage,
  SearchViewMessageType,
} from '../../core/table-search/protocol.ts'
import type { SearchStatus } from '../../core/table-search/status.ts'
import { describeError } from '../../core/text/errors.ts'
import { CommandId, ViewId } from '../command-id.ts'
import { withTimeout } from '../platform/timeout.ts'
import type { ExplorerNode } from '../tree/explorer-node.ts'
import type { ExplorerProvider } from '../tree/explorer-provider.ts'
import { bundleOf, createNonce, webviewHtml, webviewRoot } from '../webview-page.ts'

export interface TableSearchDependencies {
  readonly extensionUri: vscode.Uri
  readonly explorer: Pick<
    ExplorerProvider,
    'findStatus' | 'bestMatch' | 'onDidChangeFind' | 'prepareFind' | 'setFind'
  >
  // The Connections view, to move to what was found.
  readonly tree: Pick<vscode.TreeView<ExplorerNode>, 'reveal'>
  readonly log: Logger
}

type Handler = (message: SearchViewMessage) => Promise<void>
type MessageOf<T extends SearchViewMessage['type']> = Extract<
  SearchViewMessage,
  { readonly type: T }
>

function route<T extends SearchViewMessage['type']>(
  type: T,
  handle: (message: MessageOf<T>) => Promise<void>,
): readonly [string, Handler] {
  return [type, async (message) => handle(message as MessageOf<T>)]
}

const BUNDLE = 'table-search'
const TITLE = 'Find Table'
// How long Find Table in Explorer waits for the box to load.
const READY_TIMEOUT_MS = 10_000

// The search box above the Connections view: a webview of its own whose text filters the explorer
// on every keystroke. The host keeps the text, so that the box shows it again when VS Code loads it
// again (a webview view is dropped while hidden), and puts it back when the filter is cleared
// elsewhere.
export class TableSearchView implements vscode.WebviewViewProvider, vscode.Disposable {
  readonly #dependencies: TableSearchDependencies
  readonly #handlers: ReadonlyMap<string, Handler>
  readonly #subscription: vscode.Disposable
  #view: vscode.WebviewView | undefined
  #ready = Promise.withResolvers<undefined>()
  #isReady = false
  // The text the box holds, as far as the host knows.
  #boxText = ''

  constructor(dependencies: TableSearchDependencies) {
    this.#dependencies = dependencies
    const { explorer } = dependencies
    this.#handlers = new Map<string, Handler>([
      route(SearchViewMessageType.Ready, async () => this.#loaded()),
      route(SearchViewMessageType.Search, async ({ text }) => this.#search(text)),
      route(SearchViewMessageType.Focused, async () => {
        explorer.prepareFind()
        return Promise.resolve()
      }),
      route(SearchViewMessageType.OpenBest, async () => this.#openBest()),
      route(SearchViewMessageType.FocusTree, async () => this.#focusTree()),
      route(SearchViewMessageType.Problem, async ({ message }) => {
        this.#dependencies.log.warn(message)
        return Promise.resolve()
      }),
    ])
    this.#subscription = explorer.onDidChangeFind((status) => {
      this.#follow(status)
    })
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    const root = webviewRoot(this.#dependencies.extensionUri)
    const { webview } = view
    webview.options = { enableScripts: true, localResourceRoots: [root] }
    webview.html = webviewHtml(
      webview,
      { title: TITLE, bundle: bundleOf(root, BUNDLE) },
      createNonce(),
    )
    this.#view = view
    this.#isReady = false
    this.#ready = Promise.withResolvers()
    const listening = webview.onDidReceiveMessage((data: unknown) => {
      this.#receive(data).catch((error: unknown) => {
        this.#dependencies.log.error(`The table search failed: ${describeError(error)}`)
      })
    })
    view.onDidDispose(() => {
      listening.dispose()
      if (this.#view === view) {
        this.#view = undefined
        this.#isReady = false
      }
    })
  }

  // Find Table in Explorer: shows the box and puts the focus in it. True once it is there.
  async focus(): Promise<boolean> {
    await vscode.commands.executeCommand(`${ViewId.TableSearch}.focus`)
    await withTimeout(this.#ready.promise, READY_TIMEOUT_MS, 'The search box did not load.')
    this.#post({ type: SearchHostMessageType.Focus })
    return true
  }

  dispose(): void {
    this.#subscription.dispose()
  }

  // Messages come from the webview: they are checked before anything is done with them.
  async #receive(data: unknown): Promise<void> {
    let message: SearchViewMessage
    try {
      message = parseSearchViewMessage(data)
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error
      }
      this.#dependencies.log.warn(
        `The table search sent a message sqldoro cannot read: ${error.message}`,
      )
      return
    }
    await this.#handlers.get(message.type)?.(message)
  }

  async #loaded(): Promise<void> {
    this.#isReady = true
    this.#ready.resolve(undefined)
    const status = this.#dependencies.explorer.findStatus
    this.#boxText = status.text
    this.#post({ type: SearchHostMessageType.SetText, text: status.text })
    this.#post({ type: SearchHostMessageType.Status, status })
    return Promise.resolve()
  }

  async #search(text: string): Promise<void> {
    this.#boxText = text
    this.#dependencies.explorer.setFind(text)
    return Promise.resolve()
  }

  async #openBest(): Promise<void> {
    const node = this.#dependencies.explorer.bestMatch()
    if (node !== undefined) {
      await vscode.commands.executeCommand(CommandId.OpenTableData, node)
    }
  }

  // The table or view that matches best, selected in the explorer; without one, the explorer itself.
  async #focusTree(): Promise<void> {
    const node = this.#dependencies.explorer.bestMatch()
    await (node === undefined
      ? vscode.commands.executeCommand(`${ViewId.Connections}.focus`)
      : this.#dependencies.tree.reveal(node, { select: true, focus: true }))
  }

  // The text changed elsewhere (Clear Filter) shows in the box; what was typed in it is not sent
  // back, so that a keystroke is never undone.
  #follow(status: SearchStatus): void {
    if (status.text !== this.#boxText) {
      this.#boxText = status.text
      this.#post({ type: SearchHostMessageType.SetText, text: status.text })
    }
    this.#post({ type: SearchHostMessageType.Status, status })
  }

  #post(message: SearchHostMessage): void {
    if (this.#view !== undefined && this.#isReady) {
      void this.#view.webview.postMessage(message)
    }
  }
}
