import { type ReactElement, useEffect, useState } from 'react'

import { type ResultTab, TabStatus } from '../core/results/protocol.ts'
import { groupDigits, plural } from '../core/results/tabs.ts'
import { Icon, IconName } from './icons.tsx'

interface QuickSearchProps {
  readonly tab: ResultTab
  readonly onSearch: (text: string) => void
}

// Typing pauses this long before the search applies: each change searches every row in the host.
const TYPING_DELAY_MS = 400
const TOOLTIP =
  'Shows the rows with this text in any column, without case, with the filters of the columns. It searches the rows sqldoro fetched: when the result is limited, Load All Rows to search them all. Escape clears it.'

interface SearchDraft {
  readonly draft: string
  readonly type: (text: string) => void
  readonly send: (text: string) => void
}

// The text being typed, sent after a pause or at once (Enter, Escape); never the same text twice.
function useSearchDraft(search: string, onSearch: (text: string) => void): SearchDraft {
  const [draft, setDraft] = useState(search)
  const [sent, setSent] = useState(search)
  const send = (text: string): void => {
    setDraft(text)
    if (text !== sent) {
      setSent(text)
      onSearch(text)
    }
  }
  useSettled(draft, draft !== sent, send)
  return { draft, type: setDraft, send }
}

// Hands the value on once it has not changed for a while.
function useSettled(value: string, isPending: boolean, onSettled: (value: string) => void): void {
  useEffect(() => {
    if (!isPending) {
      return undefined
    }
    const timer = setTimeout(() => {
      onSettled(value)
    }, TYPING_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [value, isPending, onSettled])
}

// A search box over the rows of the result, in the host: it keeps the rows with the text in any
// column, and says how many it keeps.
export const QuickSearch = ({ tab, onSearch }: QuickSearchProps): ReactElement => {
  const { draft, type, send } = useSearchDraft(tab.search, onSearch)
  return (
    <span className="quick-search">
      <Icon name={IconName.Search} />
      <input
        type="search"
        aria-label="Quick Search"
        placeholder="Quick Search"
        title={TOOLTIP}
        value={draft}
        disabled={tab.status === TabStatus.Running}
        onChange={(event) => {
          type(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault()
            send(event.key === 'Enter' ? draft : '')
          }
        }}
      />
      {tab.search === '' ? null : <span className="match-count">{matchText(tab)}</span>}
    </span>
  )
}

// "12 matches", and of how many rows when the result is limited: only those were searched.
function matchText(tab: ResultTab): string {
  const matches = plural(tab.rowCount, 'match', 'matches')
  return tab.summary?.isTruncated === true
    ? `${matches} in the first ${groupDigits(tab.loadedRows)} rows`
    : matches
}
