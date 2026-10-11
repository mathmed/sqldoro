import type { PanelConnection } from '../core/results/protocol.ts'
import type { SqlDialect } from './where-source.ts'

// What the result of a tab shows of its panel: the connection, how its SQL is written, and the
// step of the trail it is, with where the grid of each step was scrolled to.
export interface ViewContext {
  readonly connection: PanelConnection | null
  readonly sql: SqlDialect | null
  readonly step: number | null
  readonly scrolls: Map<number, number>
}
