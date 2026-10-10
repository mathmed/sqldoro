import type { KeyboardEvent, ReactElement } from 'react'

import { type ResultTab, TabStatus } from '../core/results/protocol.ts'

interface TabBarProps {
  readonly tabs: readonly ResultTab[]
  readonly activeTabId: string | null
  readonly onActivate: (tabId: string) => void
}

const STATUS_LABELS: ReadonlyMap<string, string> = new Map([
  [TabStatus.Running, 'running'],
  [TabStatus.Succeeded, 'done'],
  [TabStatus.Failed, 'failed'],
  [TabStatus.Cancelled, 'cancelled'],
])
// The arrow keys move along the tabs, as in any tab list.
const STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowLeft', -1],
  ['ArrowRight', 1],
])

export const TabBar = ({ tabs, activeTabId, onActivate }: TabBarProps): ReactElement => {
  const onKeyDown = (event: KeyboardEvent): void => {
    const step = STEPS.get(event.key)
    const index = tabs.findIndex((tab) => tab.id === activeTabId)
    const next =
      step === undefined ? undefined : tabs.at((index + step + tabs.length) % tabs.length)
    if (next !== undefined) {
      event.preventDefault()
      onActivate(next.id)
    }
  }
  return (
    <div role="tablist" aria-label="Results" className="tab-bar" onKeyDown={onKeyDown}>
      {tabs.map((tab, index) => (
        <TabButton
          key={tab.id}
          tab={tab}
          position={index + 1}
          isActive={tab.id === activeTabId}
          onActivate={onActivate}
        />
      ))}
    </div>
  )
}

interface TabButtonProps {
  readonly tab: ResultTab
  readonly position: number
  readonly isActive: boolean
  readonly onActivate: (tabId: string) => void
}

const TabButton = ({ tab, position, isActive, onActivate }: TabButtonProps): ReactElement => (
  <button
    type="button"
    role="tab"
    id={`tab-${tab.id}`}
    aria-selected={isActive}
    aria-controls="result-panel"
    tabIndex={isActive ? 0 : -1}
    className={isActive ? 'tab active' : 'tab'}
    title={tab.sql}
    onClick={() => {
      onActivate(tab.id)
    }}
  >
    <span
      className={`status status-${tab.status}`}
      aria-label={STATUS_LABELS.get(tab.status)}
      role="img"
    />
    {`${String(position)}. ${tab.title}`}
  </button>
)
