import * as vscode from 'vscode'

import type { ColumnInfo, ForeignKeyInfo, IndexInfo, ObjectRef } from '../../core/engine/catalog.ts'
import { type ExplorerNode, NO_CHILDREN, nodeId, NodeKind, treeItem } from './explorer-node.ts'

function pathOf(object: ObjectRef, name: string): readonly string[] {
  return [object.database, object.schema, object.name, name]
}

function columnTraits(column: ColumnInfo): string {
  const primaryKey = column.isPrimaryKey ? ['primary key'] : []
  const notNull = column.isNullable ? [] : ['not null']
  return [column.dataType, ...primaryKey, ...notNull].join(' · ')
}

function columnTooltip(column: ColumnInfo): string {
  return [
    `${column.name} ${column.dataType}`,
    column.isNullable ? 'Nullable' : 'Not null',
    `Default: ${column.defaultValue ?? 'none'}`,
  ].join('\n')
}

export function columnNode(
  connectionId: string,
  object: ObjectRef,
  column: ColumnInfo,
): ExplorerNode {
  const node = {
    id: nodeId(NodeKind.Column, connectionId, pathOf(object, column.name)),
    kind: NodeKind.Column,
    connectionId,
  }
  return {
    ...node,
    treeItem: () =>
      treeItem(node, {
        label: column.name,
        description: columnTraits(column),
        tooltip: columnTooltip(column),
        icon: new vscode.ThemeIcon(column.isPrimaryKey ? 'key' : 'symbol-field'),
        isExpandable: false,
      }),
    children: NO_CHILDREN,
  }
}

function indexTrait(index: IndexInfo): readonly string[] {
  if (index.isPrimary) {
    return ['primary']
  }
  return index.isUnique ? ['unique'] : []
}

export function indexNode(connectionId: string, object: ObjectRef, index: IndexInfo): ExplorerNode {
  const node = {
    id: nodeId(NodeKind.Index, connectionId, pathOf(object, index.name)),
    kind: NodeKind.Index,
    connectionId,
  }
  return {
    ...node,
    treeItem: () =>
      treeItem(node, {
        label: index.name,
        description: [index.columns.join(', '), ...indexTrait(index)].join(' · '),
        icon: new vscode.ThemeIcon('list-ordered'),
        isExpandable: false,
      }),
    children: NO_CHILDREN,
  }
}

export function foreignKeyNode(
  connectionId: string,
  object: ObjectRef,
  foreignKey: ForeignKeyInfo,
): ExplorerNode {
  const node = {
    id: nodeId(NodeKind.ForeignKey, connectionId, pathOf(object, foreignKey.name)),
    kind: NodeKind.ForeignKey,
    connectionId,
  }
  const target = `${foreignKey.referencedSchema}.${foreignKey.referencedTable} (${foreignKey.referencedColumns.join(', ')})`
  const description = `${foreignKey.columns.join(', ')} → ${target}`
  return {
    ...node,
    treeItem: () =>
      treeItem(node, {
        label: foreignKey.name,
        description,
        tooltip: [
          description,
          `On update: ${foreignKey.onUpdate}`,
          `On delete: ${foreignKey.onDelete}`,
        ].join('\n'),
        icon: new vscode.ThemeIcon('references'),
        isExpandable: false,
      }),
    children: NO_CHILDREN,
  }
}
