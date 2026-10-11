import type { Dialect } from '../../core/engine/dialect.ts'
import type { Logger } from '../../core/platform.ts'
import type { HostMessage } from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import type { PanelActions } from './panel-actions.ts'

// What the messages of a result view act on: the tabs of its panel, what the panel tells the view,
// and what it cannot do on its own.
export interface PanelRequests {
  readonly actions: PanelActions
  readonly log: Logger
  readonly tab: (tabId: string) => ResultSet | undefined
  // The dialect of the last run, unknown before the first one.
  readonly dialect: () => Dialect | undefined
  readonly post: (message: HostMessage) => void
  // Tells the view that a tab changed.
  readonly update: (tab: ResultSet) => void
  // The view (re)loaded: it gets the tabs of the run again.
  readonly ready: () => void
}
