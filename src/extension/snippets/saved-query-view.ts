import * as vscode from 'vscode'

import { folderContents, type SavedQuery } from '../../core/snippets/saved-queries.ts'
import { folderName } from '../../core/text/folder-paths.ts'
import { CommandId } from '../command-id.ts'
import type { SavedQueryStore } from './saved-query-store.ts'

export const SavedQueryNodeKind = {
  Folder: 'savedQueryFolder',
  Query: 'savedQuery',
} as const

export type SavedQueryNode =
  | { readonly kind: typeof SavedQueryNodeKind.Folder; readonly path: string }
  | { readonly kind: typeof SavedQueryNodeKind.Query; readonly query: SavedQuery }

const PREVIEW_LENGTH = 60
const WHITESPACE = /\s+/g

// The Saved Queries view: folders, then the queries in them, by name.
export class SavedQueryView implements vscode.TreeDataProvider<SavedQueryNode>, vscode.Disposable {
  readonly #store: SavedQueryStore
  readonly #changes = new vscode.EventEmitter<undefined>()
  readonly #subscription: vscode.Disposable
  readonly onDidChangeTreeData = this.#changes.event

  constructor(store: SavedQueryStore) {
    this.#store = store
    this.#subscription = store.onDidChange(() => {
      this.#changes.fire(undefined)
    })
  }

  getTreeItem(node: SavedQueryNode): vscode.TreeItem {
    return node.kind === SavedQueryNodeKind.Folder ? folderItem(node.path) : queryItem(node.query)
  }

  getChildren(node?: SavedQueryNode): SavedQueryNode[] {
    if (node?.kind === SavedQueryNodeKind.Query) {
      return []
    }
    const { folders, queries } = folderContents(this.#store.list(), node?.path ?? '')
    return [
      ...folders.map((path) => ({ kind: SavedQueryNodeKind.Folder, path })),
      ...queries.map((query) => ({ kind: SavedQueryNodeKind.Query, query })),
    ]
  }

  dispose(): void {
    this.#subscription.dispose()
    this.#changes.dispose()
  }
}

function folderItem(path: string): vscode.TreeItem {
  const item = new vscode.TreeItem(folderName(path), vscode.TreeItemCollapsibleState.Expanded)
  item.id = `folder:${path}`
  item.iconPath = new vscode.ThemeIcon('folder')
  item.contextValue = SavedQueryNodeKind.Folder
  return item
}

function queryItem(query: SavedQuery): vscode.TreeItem {
  const item = new vscode.TreeItem(query.name, vscode.TreeItemCollapsibleState.None)
  const preview = query.sql.replaceAll(WHITESPACE, ' ').trim()
  item.id = `query:${query.id}`
  item.iconPath = new vscode.ThemeIcon('symbol-file')
  item.description =
    preview.length > PREVIEW_LENGTH ? `${preview.slice(0, PREVIEW_LENGTH - 1)}…` : preview
  const tooltip = new vscode.MarkdownString()
  tooltip.appendCodeblock(query.sql, 'sql')
  item.tooltip = tooltip
  item.contextValue = SavedQueryNodeKind.Query
  item.command = {
    command: CommandId.OpenSavedQuery,
    title: 'Open',
    arguments: [{ kind: SavedQueryNodeKind.Query, query }],
  }
  return item
}
