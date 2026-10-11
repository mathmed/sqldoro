import type * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { Dialect } from '../../core/engine/dialect.ts'
import type { Crumb } from '../../core/navigation/history.ts'
import type { Logger } from '../../core/platform.ts'
import { panelConnection, panelTitle } from '../../core/results/panel-connection.ts'
import { parseWebviewMessage } from '../../core/results/parse-webview-message.ts'
import {
  type HostMessage,
  HostMessageType,
  type PanelConnection,
  type WebviewMessage,
} from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import type { GuardPolicy } from '../../core/safety/guard.ts'
import type { PanelActions } from './panel-actions.ts'
import type { PanelRequests } from './panel-request-context.ts'
import { handleRequest } from './panel-requests.ts'

export interface PanelEnvironment {
  readonly now: () => number
  readonly log: Logger
  // The title of the panel, as its source is named now: a renamed connection renames its tables.
  readonly title: () => string
}

// While rows stream in, a tab tells the webview about them at most this often.
const PROGRESS_INTERVAL_MS = 100

// The result webview of one editor: the tabs of its last run, and the rows the grid asks for.
export class ResultsPanel {
  readonly #panel: vscode.WebviewPanel
  readonly #environment: PanelEnvironment
  readonly #tabs = new Map<string, ResultSet>()
  readonly #postedAt = new Map<string, number>()
  readonly #requests: PanelRequests
  #dialect: Dialect | undefined
  #connectionId: string | undefined
  #connection: PanelConnection | undefined
  #crumbs: readonly Crumb[] = []
  #activeTabId: string | null = null
  #isReady = false
  readonly #readiness = Promise.withResolvers<undefined>()

  constructor(panel: vscode.WebviewPanel, actions: PanelActions, environment: PanelEnvironment) {
    this.#panel = panel
    this.#environment = environment
    this.#requests = {
      actions,
      log: environment.log,
      tab: (id) => this.#tabs.get(id),
      dialect: () => this.#dialect,
      post: (message) => {
        this.#post(message)
      },
      update: (tab) => {
        this.updateTab(tab, true)
      },
      ready: () => {
        this.#ready()
      },
    }
  }

  // Changes made in the grid and not applied, in any tab.
  hasChanges(): boolean {
    return [...this.#tabs.values()].some((tab) => tab.editor.hasChanges)
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
    this.#connectionId = connection.id
    this.#connection = shown
    this.#panel.title = panelTitle(this.#environment.title(), shown)
    this.#post({ type: HostMessageType.Connection, connection: shown })
  }

  // A connection tagged production or made read-only says so at once, not at the next run.
  followConnection(connections: readonly ConnectionConfig[], policy: GuardPolicy): void {
    const connection = connections.find((candidate) => candidate.id === this.#connectionId)
    if (connection !== undefined) {
      this.showConnection(connection, policy)
    }
  }

  // A new run replaces the tabs of the previous one, and their rows.
  startRun(dialect: Dialect): void {
    this.#dialect = dialect
    this.#tabs.clear()
    this.#postedAt.clear()
    this.#activeTabId = null
    this.#postSql()
    this.#post({ type: HostMessageType.Tabs, tabs: [], activeTabId: null })
  }

  // The trail of a table panel reached by navigation: the view shows it above the rows.
  showTrail(crumbs: readonly Crumb[]): void {
    this.#crumbs = crumbs
    this.#post({ type: HostMessageType.Trail, crumbs })
  }

  addTab(tab: ResultSet): void {
    this.#tabs.set(tab.id, tab)
    this.#activeTabId = tab.id
    this.updateTab(tab, true)
  }

  // A run that stopped on an error leaves no tab running: each one it did not finish says why.
  failRunning(message: string): void {
    for (const tab of this.#tabs.values()) {
      if (tab.isRunning) {
        tab.fail({ message, line: null, column: null })
        this.updateTab(tab, true)
      }
    }
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
    await handleRequest(this.#requests, message)
  }

  // How the SQL of the connection is written, for the WHERE of a table to color and complete it.
  #postSql(): void {
    if (this.#dialect !== undefined) {
      const { identifierQuote, lexical, keywords } = this.#dialect
      this.#post({ type: HostMessageType.Sql, identifierQuote, lexical, keywords })
    }
  }

  #post(message: HostMessage): void {
    if (this.#isReady) {
      void this.#panel.webview.postMessage(message)
    }
  }

  // A webview that (re)loads gets the tabs of the run again; it asks for the rows it shows.
  #ready(): void {
    this.#isReady = true
    this.#readiness.resolve(undefined)
    if (this.#connection !== undefined) {
      this.#post({ type: HostMessageType.Connection, connection: this.#connection })
    }
    this.#postSql()
    this.#post({ type: HostMessageType.Trail, crumbs: this.#crumbs })
    const tabs = [...this.#tabs.values()].map((tab) => tab.toTab())
    this.#post({ type: HostMessageType.Tabs, tabs, activeTabId: this.#activeTabId })
  }
}
