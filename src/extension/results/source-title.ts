import type * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import { tablePanelTitle } from '../../core/results/table-data.ts'
import { documentLabel } from '../editor/document-label.ts'
import { type TableTarget, tableTargetOf } from '../tables/table-uri.ts'

// Where the names in a title come from: the connections as they are now, and their engines.
export interface TitleSources {
  readonly connections: (id: string) => ConnectionConfig | undefined
  readonly engines: Pick<EngineRegistry, 'find'>
}

// The title of the result panel of a source: "Results: query.sql" beside a SQL editor, and the path
// of a table from its connection ("Shop/shop/sales.orders") for a table panel.
export function sourceTitle(uri: vscode.Uri, sources: TitleSources): string {
  const target = tableTargetOf(uri)
  if (target === undefined) {
    return `Results: ${documentLabel(uri)}`
  }
  return tableTitle(target, sources) ?? documentLabel(uri)
}

// Undefined once the connection, or its engine, is gone.
function tableTitle(target: TableTarget, sources: TitleSources): string | undefined {
  const connection = sources.connections(target.connectionId)
  if (connection === undefined) {
    return undefined
  }
  const engine = sources.engines.find(connection.engine)
  return engine === undefined
    ? undefined
    : tablePanelTitle(connection.name, target.table, engine.dialect)
}
