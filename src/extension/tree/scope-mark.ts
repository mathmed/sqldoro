import type * as vscode from 'vscode'

import { type SelectedScope, SelectionSource, showsScope } from '../../core/editor/selection.ts'
import { type ExplorerNode, type ItemLook, type NodeContext, NodeKind } from './explorer-node.ts'
import { type IconLook, selectedIcon } from './node-icons.ts'
import { databaseUri, schemaUri } from './node-uris.ts'

const EDITOR_NOTE = 'The SQL editor in front runs here'
const DEFAULT_NOTE = 'New queries on this connection run here'

interface MarkedLook {
  readonly label: string
  readonly icon: IconLook
  readonly tooltip?: string
}

// A database or schema carries a URI, for the color of its label; the one the SQL editor in front
// runs on (with none in front, the default of its connection) shows its icon in the accent and says
// so in its tooltip.
export function markOf(
  node: ExplorerNode,
  look: MarkedLook,
  context: NodeContext,
): Partial<Pick<ItemLook, 'icon' | 'resourceUri' | 'tooltip'>> {
  const place = scopePlace(node)
  if (place === undefined) {
    return {}
  }
  const resourceUri = uriOf(node.connectionId, place)
  const selected = context.selected(node.connectionId)
  return selected !== undefined && showsScope(place, selected)
    ? { resourceUri, ...selectedLook(look, selected) }
    : { resourceUri }
}

function uriOf(connectionId: string, place: ScopePlace): vscode.Uri {
  return place.isSchema
    ? schemaUri(connectionId, place.database, place.schema)
    : databaseUri(connectionId, place.database)
}

function selectedLook(
  look: MarkedLook,
  selected: SelectedScope,
): Pick<ItemLook, 'icon' | 'tooltip'> {
  const note = selected.source === SelectionSource.Editor ? EDITOR_NOTE : DEFAULT_NOTE
  return {
    icon: selectedIcon(look.icon),
    tooltip: [look.tooltip ?? look.label, note].join('\n'),
  }
}

export interface ScopePlace {
  readonly database: string
  readonly schema: string
  readonly isSchema: boolean
}

// Where a database or schema node is; undefined for any other node.
export function scopePlace(node: ExplorerNode): ScopePlace | undefined {
  const isScope = node.kind === NodeKind.Database || node.kind === NodeKind.Schema
  return isScope && node.place !== undefined
    ? { ...node.place, isSchema: node.kind === NodeKind.Schema }
    : undefined
}
