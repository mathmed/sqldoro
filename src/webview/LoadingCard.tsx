import { type ReactElement, useEffect, useState } from 'react'

import {
  type Indicator,
  IndicatorLook,
  type Wait,
  waitedMs,
} from '../core/grid/loading-indicator.ts'
import { type ResultTab, TabProgress } from '../core/results/protocol.ts'
import { formatDuration, plural } from '../core/results/tabs.ts'

interface LoadingOverlayProps {
  readonly indicator: Indicator
  // The tab the view waits for.
  readonly tab: ResultTab
  readonly onCancel: () => void
}

// The time the card shows moves on this often.
const TICK_MS = 100
const SKELETON_ROWS = 40

const TEXTS: ReadonlyMap<TabProgress, string> = new Map([
  [TabProgress.Connecting, 'Connecting…'],
  [TabProgress.Running, 'Running query…'],
])

// While the view waits long enough to notice: what it waits for, a bar that moves, the time it has
// waited, and Cancel, which stops the statement on the server. It fades in and out over the grid
// (panels.css), and stays long enough to read; a fast load shows none (the core decides when).
export const LoadingOverlay = ({ indicator, tab, onCancel }: LoadingOverlayProps): ReactElement => (
  <div
    className={
      indicator.look === IndicatorLook.Shown ? 'loading-overlay is-shown' : 'loading-overlay'
    }
  >
    {indicator.look === IndicatorLook.Hidden ? null : (
      <div className="loading-card" role="status" aria-live="polite">
        <p className="loading-text">{progressText(tab)}</p>
        <div className="progress-bar" aria-hidden="true">
          <span />
        </div>
        <div className="loading-footer">
          <Elapsed wait={indicator.wait} />
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    )}
  </div>
)

function progressText(tab: Pick<ResultTab, 'loadedRows' | 'progress'>): string {
  return TEXTS.get(tab.progress) ?? `Fetching rows… ${plural(tab.loadedRows, 'row', 'rows')} so far`
}

// How long the view has waited, as time goes; it stops when the wait ends. Only this re-renders as
// time goes.
const Elapsed = ({ wait }: { readonly wait: Wait | null }): ReactElement => {
  const now = useNow(wait?.until === null)
  return <span className="loading-time">{formatDuration(waitedMs(wait, now))}</span>
}

function useNow(isTicking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isTicking) {
      return undefined
    }
    const timer = setInterval(() => {
      setNow(Date.now())
    }, TICK_MS)
    return () => {
      clearInterval(timer)
    }
  }, [isTicking])
  return now
}

// Where the rows go, before the first of them: a header and rows, as the grid lays them out.
export const Skeleton = (): ReactElement => (
  <div className="skeleton" aria-hidden="true">
    <div className="skeleton-header" />
    {Array.from({ length: SKELETON_ROWS }, (...[, index]) => (
      <div key={index} className="skeleton-row" />
    ))}
  </div>
)
