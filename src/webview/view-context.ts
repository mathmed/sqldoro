import type { PanelConnection } from '../core/results/protocol.ts'
import type { WaitIndicator } from './wait-indicator.ts'
import type { SqlDialect } from './where-source.ts'

// What the result of a tab shows of its panel: the connection, how its SQL is written, the step of
// the trail it is, with where the grid of each step was scrolled to, and whether the panel shows
// that it waits.
export interface ViewContext {
  readonly connection: PanelConnection | null
  readonly sql: SqlDialect | null
  readonly step: number | null
  readonly scrolls: Map<number, number>
  readonly indicator: WaitIndicator
}
