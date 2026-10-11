import type * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { Engine } from '../../core/engine/engine.ts'
import type { TableStep } from '../../core/navigation/history.ts'
import type { TableContext } from './table-context.ts'
import { type TableTarget, tableTargetOf } from './table-uri.ts'

// A table panel as it is now: what it was opened on, the step of its trail it shows, and its
// connection and engine.
export interface TableSource {
  readonly target: TableTarget
  readonly step: TableStep
  readonly connection: ConnectionConfig
  readonly engine: Engine
}

// Undefined for another source, a panel without a trail, or a connection that is gone.
export function tableSourceOf(
  context: Pick<TableContext, 'connections' | 'engines' | 'navigations'>,
  uri: vscode.Uri,
): TableSource | undefined {
  const target = tableTargetOf(uri)
  const step = context.navigations.current(uri)
  const connection = target === undefined ? undefined : context.connections(target.connectionId)
  if (target === undefined || step === undefined || connection === undefined) {
    return undefined
  }
  return { target, step, connection, engine: context.engines.get(connection.engine) }
}
