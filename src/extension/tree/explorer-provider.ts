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

// The Connections view: children load when a node opens and stay until it is refreshed or its
// connection changes state. A failure becomes a line in the tree instead of an error dialog.
export class ExplorerProvider implements vscode.TreeDataProvider<ExplorerNode>, vscode.Disposable {
  readonly #dependencies: ExplorerDependencies
  readonly #changes = new vscode.EventEmitter<ExplorerNode | undefined>()
  readonly #cache = new Map<string, Map<string, Children>>()
  readonly #roots = new Map<string, ExplorerNode>()
  readonly #subscription: vscode.Disposable
  #filter = ''
  readonly onDidChangeTreeData = this.#changes.event

  constructor(dependencies: ExplorerDependencies) {
    this.#dependencies = dependencies
    this.#subscription = dependencies.sessions.onDidChange((connectionId) => {
      this.#refreshConnection(connectionId)
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
    const cache = this.#cacheOf(node.connectionId)
    return [...(await (cache.get(node.id) ?? this.#load(node, cache)))]
  }

  refresh(node?: ExplorerNode): void {
    if (node === undefined) {
      this.#cache.clear()
    } else {
      this.#cache.delete(node.connectionId)
    }
    this.#changes.fire(node)
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

  async #load(node: ExplorerNode, cache: Map<string, Children>): Children {
    const children = node.children(this.#context()).catch((error: unknown) => {
      cache.delete(node.id)
      const text = describeError(error)
      this.#dependencies.log.warn(`Could not load the children of ${node.id}: ${text}`)
      return [messageNode(node, { text, tone: MessageTone.Error })]
    })
    cache.set(node.id, children)
    return children
  }

  #cacheOf(connectionId: string): Map<string, Children> {
    const existing = this.#cache.get(connectionId)
    if (existing !== undefined) {
      return existing
    }
    const cache = new Map<string, Children>()
    this.#cache.set(connectionId, cache)
    return cache
  }

  #refreshConnection(connectionId: string): void {
    this.#cache.delete(connectionId)
    const node = this.#roots.get(connectionId)
    if (node !== undefined) {
      this.#changes.fire(node)
    }
  }

  #context(): NodeContext {
    const { sessions } = this.#dependencies
    return {
      state: (connectionId) => sessions.state(connectionId),
      session: (connectionId) => sessions.session(connectionId)?.engineSession,
      filter: this.#filter,
    }
  }
}
