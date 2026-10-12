import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import type { Logger } from '../../core/platform.ts'
import type { GuardPolicy } from '../../core/safety/guard.ts'
import type { QueryRunner } from '../editor/query-runner.ts'
import type { TableMetadata } from '../metadata/table-metadata.ts'
import type { ResultsPanels } from '../results/results-panels.ts'
import type { ColumnLayouts } from './column-layouts.ts'
import type { TableNavigations } from './table-navigations.ts'

// What the table panels work with: the runner every read goes through, their panels and trails,
// the layouts of their columns, and the catalog of their connections.
export interface TableContext {
  readonly runner: QueryRunner
  readonly panels: ResultsPanels
  readonly navigations: TableNavigations
  readonly layouts: ColumnLayouts
  readonly metadata: TableMetadata
  readonly connections: (id: string) => ConnectionConfig | undefined
  readonly engines: EngineRegistry
  // The session of the explorer on a connection, where the catalog is read.
  readonly catalogOf: (connection: ConnectionConfig) => Promise<EngineSession>
  readonly createId: () => string
  // The guard policy of the settings: how a panel shows its connection.
  readonly policy: () => GuardPolicy
  readonly log: Logger
}
