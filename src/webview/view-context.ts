import type { PanelConnection } from '../core/results/protocol-parts.ts'
import type { WaitIndicator } from './wait-indicator.ts'
import type { SqlDialect } from './where-source.ts'

// Whether a table panel shows its query box in place of the WHERE of its table, and what toggles it.
export interface QueryModeSwitch {
  readonly isOn: boolean
  readonly toggle: () => void
}

// What the result of a tab shows of its panel: the connection, how its SQL is written, the step of
// the trail it is, with where the grid of each step was scrolled to, whether the panel shows that
// it waits, and whether its query box is shown.
export interface ViewContext {
  readonly connection: PanelConnection | null
  readonly sql: SqlDialect | null
  readonly step: number | null
  readonly scrolls: Map<number, number>
  readonly indicator: WaitIndicator
  readonly queryMode: QueryModeSwitch
}
