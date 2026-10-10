import type * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import type { Logger } from '../../core/platform.ts'
import type { ExportFormat } from '../../core/results/export-format.ts'
import { panelConnection, panelTitle } from '../../core/results/panel-connection.ts'
import { parseWebviewMessage } from '../../core/results/parse-webview-message.ts'
import {
  type CellRange,
  type HostMessage,
  HostMessageType,
  type PanelConnection,
  type WebviewMessage,
  WebviewMessageType,
} from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import type { ViewSpec } from '../../core/results/view.ts'
import type { GuardPolicy } from '../../core/safety/guard.ts'

export interface CopyRequest {
  readonly range: CellRange
  readonly format: ExportFormat
}

// What the panel cannot do on its own: the extension wires these to the runner, the clipboard and
// the file system.
export interface PanelActions {
  readonly cancel: () => void
  readonly serverView: (tab: ResultSet, view: ViewSpec) => Promise<void>
  readonly loadAll: (tab: ResultSet) => Promise<void>
  readonly copy: (tab: ResultSet, request: CopyRequest, dialect: Dialect) => Promise<void>
  readonly export: (tab: ResultSet, format: ExportFormat, dialect: Dialect) => Promise<void>
}

export interface PanelEnvironment {
  readonly now: () => number
  readonly log: Logger
}

type Handler = (message: WebviewMessage) => Promise<void>
type MessageOf<T extends WebviewMessage['type']> = Extract<WebviewMessage, { readonly type: T }>

// Each handler gets the message of its own type: the map below routes by type, so the narrowing is
// done once, here.
function route<T extends WebviewMessage['type']>(
  type: T,
  handle: (message: MessageOf<T>) => Promise<void>,
): readonly [string, Handler] {
  return [type, async (message) => handle(message as MessageOf<T>)]
}

// Long text is cut in the grid; the cell detail asks for the rest.
const MAX_CELL_PREVIEW = 1000
// While rows stream in, a tab tells the webview about them at most this often.
const PROGRESS_INTERVAL_MS = 100

// The result webview of one editor: the tabs of its last run, and the rows the grid asks for.
export class ResultsPanel {
  readonly #panel: vscode.WebviewPanel
  readonly #actions: PanelActions
  readonly #environment: PanelEnvironment
  readonly #tabs = new Map<string, ResultSet>()
  readonly #postedAt = new Map<string, number>()
  readonly #handlers: ReadonlyMap<string, Handler>
  readonly #title: string
  #dialect: Dialect | undefined
  #connection: PanelConnection | undefined
  #activeTabId: string | null = null
  #isReady = false
  readonly #readiness = Promise.withResolvers<undefined>()

  constructor(panel: vscode.WebviewPanel, actions: PanelActions, environment: PanelEnvironment) {
    this.#panel = panel
    this.#title = panel.title
    this.#actions = actions
    this.#environment = environment
    this.#handlers = new Map<string, Handler>([
      route(WebviewMessageType.Ready, async () => this.#ready()),
      route(WebviewMessageType.FetchRows, async (message) => this.#sendRows(message)),
      route(WebviewMessageType.FetchCell, async (message) => this.#sendCell(message)),
      route(WebviewMessageType.SetView, async (message) => this.#setView(message)),
      route(WebviewMessageType.Copy, async (message) => this.#copy(message)),
      route(WebviewMessageType.Export, async (message) => this.#export(message)),
      route(WebviewMessageType.Cancel, async () => this.#cancel()),
      route(WebviewMessageType.LoadAll, async (message) => this.#loadAll(message)),
      route(WebviewMessageType.Problem, async (message) => this.#problem(message)),
    ])
  }

  get panel(): vscode.WebviewPanel {
    return this.#panel
  }

  // Resolves when the webview has loaded and asked for the tabs.
  get whenReady(): Promise<undefined> {
    return this.#readiness.promise
  }

  tab(id: string): ResultSet | undefined {
    return this.#tabs.get(id)
  }

  reveal(): void {
    this.#panel.reveal(undefined, true)
  }

  // The connection the editor runs on, shown above the tabs; its environment goes in the title.
  showConnection(connection: ConnectionConfig, policy: GuardPolicy): void {
    const shown = panelConnection(connection, policy)
    this.#connection = shown
    this.#panel.title = panelTitle(this.#title, shown)
    this.#post({ type: HostMessageType.Connection, connection: shown })
  }

  // A new run replaces the tabs of the previous one, and their rows.
  startRun(dialect: Dialect): void {
    this.#dialect = dialect
    this.#tabs.clear()
    this.#postedAt.clear()
    this.#activeTabId = null
    this.#post({ type: HostMessageType.Tabs, tabs: [], activeTabId: null })
  }

  addTab(tab: ResultSet): void {
    this.#tabs.set(tab.id, tab)
    this.#activeTabId = tab.id
    this.updateTab(tab, true)
  }

  // Progress is sent at most every PROGRESS_INTERVAL_MS; what ends a statement is sent at once.
  updateTab(tab: ResultSet, isUrgent: boolean): void {
    const now = this.#environment.now()
    const last = this.#postedAt.get(tab.id)
    if (!isUrgent && last !== undefined && now - last < PROGRESS_INTERVAL_MS) {
      return
    }
    this.#postedAt.set(tab.id, now)
    this.#post({ type: HostMessageType.Tab, tab: tab.toTab() })
  }

  // Messages come from the webview: they are checked before anything is done with them.
  async receive(data: unknown): Promise<void> {
    let message: WebviewMessage
    try {
      message = parseWebviewMessage(data)
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error
      }
      this.#environment.log.warn(
        `The result view sent a message sqldoro cannot read: ${error.message}`,
      )
      return
    }
    await this.#handlers.get(message.type)?.(message)
  }

  #post(message: HostMessage): void {
    if (this.#isReady) {
      void this.#panel.webview.postMessage(message)
    }
  }

  // A webview that (re)loads gets the tabs of the run again; it asks for the rows it shows.
  async #ready(): Promise<void> {
    this.#isReady = true
    this.#readiness.resolve(undefined)
    if (this.#connection !== undefined) {
      this.#post({ type: HostMessageType.Connection, connection: this.#connection })
    }
    const tabs = [...this.#tabs.values()].map((tab) => tab.toTab())
    this.#post({ type: HostMessageType.Tabs, tabs, activeTabId: this.#activeTabId })
    return Promise.resolve()
  }

  #current(tabId: string, viewVersion: number): ResultSet | undefined {
    const tab = this.#tabs.get(tabId)
    return tab?.viewVersion === viewVersion ? tab : undefined
  }

  async #sendRows(message: MessageOf<typeof WebviewMessageType.FetchRows>): Promise<void> {
    const tab = this.#current(message.tabId, message.viewVersion)
    if (tab !== undefined) {
      const { tabId, viewVersion, start, count } = message
      const rows = tab.window(start, count, MAX_CELL_PREVIEW)
      this.#post({ type: HostMessageType.Rows, tabId, viewVersion, start, rows })
    }
    return Promise.resolve()
  }

  async #sendCell(message: MessageOf<typeof WebviewMessageType.FetchCell>): Promise<void> {
    const tab = this.#current(message.tabId, message.viewVersion)
    if (tab !== undefined) {
      const { tabId, viewVersion, row, column } = message
      const value = tab.cell(row, column)
      this.#post({ type: HostMessageType.Cell, tabId, viewVersion, row, column, value })
    }
    return Promise.resolve()
  }

  // The rows already here are sorted and filtered at once; the server view runs the query again.
  async #setView(message: MessageOf<typeof WebviewMessageType.SetView>): Promise<void> {
    const tab = this.#tabs.get(message.tabId)
    if (tab === undefined || tab.isRunning) {
      return
    }
    if (message.isServerSide) {
      await this.#actions.serverView(tab, message.view)
      return
    }
    tab.applyView(message.view)
    this.updateTab(tab, true)
  }

  async #copy(message: MessageOf<typeof WebviewMessageType.Copy>): Promise<void> {
    const tab = this.#current(message.tabId, message.viewVersion)
    if (tab !== undefined && this.#dialect !== undefined) {
      await this.#actions.copy(tab, { range: message.range, format: message.format }, this.#dialect)
    }
  }

  async #export(message: MessageOf<typeof WebviewMessageType.Export>): Promise<void> {
    const tab = this.#tabs.get(message.tabId)
    if (tab !== undefined && this.#dialect !== undefined) {
      await this.#actions.export(tab, message.format, this.#dialect)
    }
  }

  async #loadAll(message: MessageOf<typeof WebviewMessageType.LoadAll>): Promise<void> {
    const tab = this.#tabs.get(message.tabId)
    if (tab !== undefined && !tab.isRunning) {
      await this.#actions.loadAll(tab)
    }
  }

  async #cancel(): Promise<void> {
    this.#actions.cancel()
    return Promise.resolve()
  }

  async #problem(message: MessageOf<typeof WebviewMessageType.Problem>): Promise<void> {
    this.#environment.log.warn(`The result view had a problem: ${message.message}`)
    return Promise.resolve()
  }
}
