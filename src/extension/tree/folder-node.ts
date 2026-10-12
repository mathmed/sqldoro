import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { folderNode as folderContents } from '../../core/connection/folders.ts'
import { folderName } from '../../core/text/folder-paths.ts'
import { type ExplorerNode, nodeId, NodeKind } from './explorer-node.ts'
import { NodeIcon, themeIcon } from './node-icons.ts'

// What the folders of the view show: the connections as they are saved now, each made a node once
// (the view finds a connection again by its node).
export interface FolderSource {
  readonly connections: readonly ConnectionConfig[]
  readonly nodeOf: (connection: ConnectionConfig) => ExplorerNode
}

// The folders and the connections of a folder of the Connections view (the top for an empty path),
// the folders first, each by name.
export function folderChildren(source: FolderSource, path: string): ExplorerNode[] {
  const contents = folderContents(source.connections, path)
  return [
    ...contents.folders.map((folder) => folderNode(source, folder)),
    ...contents.connections.map((connection) => source.nodeOf(connection)),
  ]
}

// A folder opens on its connections; renaming or deleting it never touches them.
function folderNode(source: FolderSource, path: string): ExplorerNode {
  const node: ExplorerNode = {
    id: nodeId(NodeKind.Folder, '', [path]),
    kind: NodeKind.Folder,
    connectionId: '',
    place: { database: '', schema: '', name: path },
    treeItem: () => {
      const item = new vscode.TreeItem(folderName(path), vscode.TreeItemCollapsibleState.Expanded)
      item.id = node.id
      item.contextValue = NodeKind.Folder
      item.iconPath = themeIcon(NodeIcon.Folder)
      item.tooltip = path
      return item
    },
    children: async () => Promise.resolve(folderChildren(source, path)),
  }
  return node
}
