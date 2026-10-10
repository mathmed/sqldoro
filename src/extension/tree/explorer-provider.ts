import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { Logger } from '../../core/platform.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SessionManager } from '../sessions/session-manager.ts'
import { connectionNode } from './connection-node.ts'
import { type ExplorerNode, messageNode, MessageTone, type NodeContext } from './explorer-node.ts'

export interface ExplorerDependencies {
  readonly connections: () => readonly ConnectionConfig[]
  readonly sessions: SessionManager
  readonly engines: EngineRegistry
  readonly log: Logger
}

type Children = Promise<readonly ExplorerNode[]>

// What the view loaded under a connection: the children of its nodes, and what the nodes said of
// them (how many tables a group holds).
interface Loaded {
  readonly children: Map<string, Children>
  readonly summaries: Map<string, string>
}

// The Connections view: children load when a node opens and stay until it is refreshed or its
// connection changes state. A failure becomes a line in the tree instead of an error dialog.
export class ExplorerProvider implements vscode.TreeDataProvider<ExplorerNode>, vscode.Disposable {
  readonly #dependencies: ExplorerDependencies
  readonly #changes = new vscode.EventEmitter<ExplorerNode | undefined>()
  readonly #loaded = new Map<string, Loaded>()
  readonly #roots = new Map<string, ExplorerNode>()
  readonly #subscription: vscode.Disposable
  #filter = ''
  readonly onDidChangeTreeData = this.#changes.event

  constructor(dependencies: ExplorerDependencies) {
    this.#dependencies = dependencies
    this.#subscription = dependencies.sessions.onDidChange((connectionId) => {
      this.refreshConnection(connectionId)
    })
  }

  get filter(): string {
    return this.#filter
  }

  setFilter(filter: string): void {
    this.#filter = filter.trim()
    this.refresh()
  }

  getTreeItem(node: ExplorerNode): vscode.TreeItem {
    return node.treeItem(this.#context())
  }

  async getChildren(node?: ExplorerNode): Promise<ExplorerNode[]> {
    if (node === undefined) {
      return this.#rootNodes()
    }
    const loaded = this.#loadedOf(node.connectionId)
    return [...(await (loaded.children.get(node.id) ?? this.#load(node, loaded)))]
  }

  // A node that shows statistics of the list it comes from has that list read again.
  refresh(node?: ExplorerNode): void {
    if (node === undefined) {
      this.#loaded.clear()
    } else {
      this.#loaded.delete(node.connectionId)
    }
    this.#changes.fire(node?.listedBy ?? node)
  }

  dispose(): void {
    this.#subscription.dispose()
    this.#changes.dispose()
  }

  #rootNodes(): ExplorerNode[] {
    const connections = this.#dependencies
      .connections()
      .toSorted((left, right) => left.name.localeCompare(right.name))
    const nodes = connections.map((connection) =>
      connectionNode(connection, this.#dependencies.engines),
    )
    this.#roots.clear()
    for (const node of nodes) {
      this.#roots.set(node.connectionId, node)
    }
    return nodes
  }

  async #load(node: ExplorerNode, loaded: Loaded): Children {
    const children = this.#read(node, loaded).catch((error: unknown) => {
      loaded.children.delete(node.id)
      const text = describeError(error)
      this.#dependencies.log.warn(`Could not load the children of ${node.id}: ${text}`)
      return [messageNode(node, { text, tone: MessageTone.Error })]
    })
    loaded.children.set(node.id, children)
    return children
  }

  // VS Code draws a node again only when told: a node that summarized its children is redrawn.
  async #read(node: ExplorerNode, loaded: Loaded): Children {
    const summarize = (text: string): void => {
      loaded.summaries.set(node.id, text)
    }
    const children = await node.children({ ...this.#context(), summarize })
    if (loaded.summaries.has(node.id)) {
      this.#changes.fire(node)
    }
    return children
  }

  #loadedOf(connectionId: string): Loaded {
    const existing = this.#loaded.get(connectionId)
    if (existing !== undefined) {
      return existing
    }
    const loaded = { children: new Map<string, Children>(), summaries: new Map<string, string>() }
    this.#loaded.set(connectionId, loaded)
    return loaded
  }

  // Reloads everything under a connection (after a statement changed its schema, for one).
  refreshConnection(connectionId: string): void {
    this.#loaded.delete(connectionId)
    const node = this.#roots.get(connectionId)
    if (node !== undefined) {
      this.#changes.fire(node)
    }
  }

  #context(): NodeContext {
    const { sessions, log } = this.#dependencies
    return {
      state: (connectionId) => sessions.state(connectionId),
      session: (connectionId) => sessions.session(connectionId)?.engineSession,
      filter: this.#filter,
      log,
      summaryOf: (node) => this.#loaded.get(node.connectionId)?.summaries.get(node.id),
    }
  }
}
