import { NodeKind } from './explorer-node.ts'

const TEXTS: ReadonlyMap<NodeKind, string> = new Map([
  [NodeKind.Connection, 'Loading databases…'],
  [NodeKind.Database, 'Loading schemas…'],
  [NodeKind.Tables, 'Loading tables…'],
  [NodeKind.Views, 'Loading views…'],
  [NodeKind.View, 'Loading columns…'],
  [NodeKind.Columns, 'Loading columns…'],
  [NodeKind.Indexes, 'Loading indexes…'],
  [NodeKind.ForeignKeys, 'Loading foreign keys…'],
])

// What the line of a list that takes a while to load says; any other list loads.
export function loadingText(kind: NodeKind): string {
  return TEXTS.get(kind) ?? 'Loading…'
}
