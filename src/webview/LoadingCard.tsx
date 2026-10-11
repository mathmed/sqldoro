import { type ReactElement, useEffect, useState } from 'react'

import { type ResultTab, TabProgress } from '../core/results/protocol.ts'
import { formatDuration, plural } from '../core/results/tabs.ts'

interface LoadingCardProps {
  readonly tab: ResultTab
  readonly onCancel: () => void
}

// A statement that ends this fast shows no card: no flicker for a quick query.
export const SHOW_AFTER_MS = 150
const TICK_MS = 100
const SKELETON_ROWS = 12

const TEXTS: ReadonlyMap<TabProgress, string> = new Map([
  [TabProgress.Connecting, 'Connecting…'],
  [TabProgress.Running, 'Running query…'],
])

// While a statement runs (the card shows as long as it does): what is happening, a bar that moves,
// the time it has taken, and Cancel, which stops it on the server. Rows not here yet show as a
// shimmer behind it.
export const LoadingCard = ({ tab, onCancel }: LoadingCardProps): ReactElement | null => {
  const elapsed = useElapsed()
  if (elapsed < SHOW_AFTER_MS) {
    return null
  }
  return (
    <div className="loading-overlay">
      {tab.columns.length === 0 ? <Skeleton /> : null}
      <div className="loading-card" role="status" aria-live="polite">
        <p className="loading-text">{progressText(tab)}</p>
        <div className="progress-bar" aria-hidden="true">
          <span />
        </div>
        <div className="loading-footer">
          <span className="loading-time">{formatDuration(elapsed)}</span>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function progressText(tab: Pick<ResultTab, 'loadedRows' | 'progress'>): string {
  return TEXTS.get(tab.progress) ?? `Fetching rows… ${plural(tab.loadedRows, 'row', 'rows')} so far`
}

// How long the card has been there, as time goes.
function useElapsed(): number {
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(startedAt)
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, TICK_MS)
    return () => {
      clearInterval(timer)
    }
  }, [])
  return Math.max(now - startedAt, 0)
}

const Skeleton = (): ReactElement => (
  <div className="skeleton" aria-hidden="true">
    {Array.from({ length: SKELETON_ROWS }, (...[, index]) => (
      <div key={index} className="skeleton-row" />
    ))}
  </div>
)
