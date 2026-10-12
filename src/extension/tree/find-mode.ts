import * as vscode from 'vscode'

import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { type FoundChanges, mergeChanges, NO_CHANGES } from '../../core/table-search/changes.ts'
import { findTables, type FoundTables } from '../../core/table-search/found.ts'
import { type SearchStatus, statusOf } from '../../core/table-search/status.ts'
import type { ExplorerNode } from './explorer-node.ts'
import { FindTree } from './find-tree.ts'
import type { IndexedSource, TableIndex } from './table-index.ts'

export interface FindModeDependencies {
  readonly index: Pick<TableIndex, 'load' | 'onDidChange' | 'snapshot'>
  readonly engines: EngineRegistry
  // Resolves after this many milliseconds.
  readonly delay: (milliseconds: number) => Promise<void>
  // Tells VS Code to draw these nodes again, or the whole tree.
  readonly redraw: (nodes: readonly ExplorerNode[] | undefined) => void
}

// VS Code draws the change of a tree at once when it was told of none in the last 200 ms, and
// otherwise only once it has been told of none for 200 ms: told of every keystroke, the tree would
// follow the first one and then wait for a pause. Told at most once in this time, it follows the
// typing; what changed meanwhile waits and is drawn together.
const TREE_PACE_MS = 220
const ROOT_CHANGED: FoundChanges = { isRootChanged: true, keys: new Set() }

// Finding a table in the explorer as it is typed: the tables and views are filtered in memory on
// every keystroke (TableIndex), the found tree is updated in place and VS Code is told only what
// changed. The box of Find Table in Explorer follows where it stands (`onDidChange`).
export class FindMode implements vscode.Disposable {
  readonly #dependencies: FindModeDependencies
  readonly #tree: FindTree
  readonly #changes = new vscode.EventEmitter<SearchStatus>()
  readonly onDidChange = this.#changes.event
  readonly #subscription: vscode.Disposable
  #text = ''
  #found: FoundTables<IndexedSource>
  #pending = NO_CHANGES
  #isPacing = false

  constructor(dependencies: FindModeDependencies) {
    this.#dependencies = dependencies
    this.#tree = new FindTree(dependencies.engines)
    this.#found = findTables(dependencies.index.snapshot(), '')
    this.#subscription = dependencies.index.onDidChange(() => {
      this.#indexChanged()
    })
  }

  // The text the explorer is filtered by; empty when it shows the tree as it is.
  get text(): string {
    return this.#found.text
  }

  get isActive(): boolean {
    return this.text !== ''
  }

  get status(): SearchStatus {
    return statusOf(this.#text, this.#found)
  }

  get tree(): Pick<FindTree, 'childrenOf' | 'bestMatch' | 'parentOf' | 'roots'> {
    return this.#tree
  }

  // The text as typed, on every keystroke.
  setText(text: string): void {
    const isAlreadyActive = this.isActive
    this.#text = text
    const changes = this.#tree.update(this.#search())
    this.#afterTyping(isAlreadyActive, changes)
    this.#changes.fire(this.status)
  }

  // Starts loading the tables, so that they are there once typed.
  prepare(): void {
    void this.#dependencies.index.load()
  }

  // The connections were edited: their nodes are made again.
  reset(): void {
    this.#tree.reset()
  }

  dispose(): void {
    this.#subscription.dispose()
    this.#changes.dispose()
  }

  // Starting or stopping draws the whole tree, which goes from the explorer to what is found and
  // back; finding starts loading the tables.
  #afterTyping(isAlreadyActive: boolean, changes: FoundChanges): void {
    if (isAlreadyActive) {
      this.#redraw(this.isActive ? changes : ROOT_CHANGED)
      return
    }
    if (this.isActive) {
      this.prepare()
      this.#redraw(ROOT_CHANGED)
    }
  }

  #search(): FoundTables<IndexedSource> {
    this.#found = findTables(this.#dependencies.index.snapshot(), this.#text)
    return this.#found
  }

  // More tables loaded, or a connection forgotten: what was forgotten loads again.
  #indexChanged(): void {
    const found = this.#search()
    if (this.isActive) {
      this.prepare()
      this.#redraw(this.#tree.update(found))
    }
    this.#changes.fire(this.status)
  }

  #redraw(changes: FoundChanges): void {
    this.#pending = mergeChanges(this.#pending, changes)
    if (!this.#isPacing) {
      this.#flush()
    }
  }

  #flush(): void {
    const { isRootChanged, keys } = this.#pending
    const nodes = isRootChanged ? undefined : this.#tree.nodesOf(keys)
    this.#pending = NO_CHANGES
    if (nodes?.length === 0) {
      return
    }
    this.#dependencies.redraw(nodes)
    this.#isPacing = true
    void this.#dependencies.delay(TREE_PACE_MS).then(() => {
      this.#isPacing = false
      this.#flush()
    })
  }
}
