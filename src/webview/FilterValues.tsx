import { type ReactElement, useEffect, useState } from 'react'

import { type DistinctMessage, MAX_DISTINCT_VALUES } from '../core/results/protocol.ts'
import { matchesFilter } from '../core/text/filter.ts'

// The values a column holds, as the host listed them.
export type DistinctValues = Pick<DistinctMessage, 'isComplete' | 'values'>

interface ValueChecklistProps {
  // The values of an enum; empty for any other column, whose values are asked of the host.
  readonly options: readonly string[]
  readonly distinct: DistinctValues | undefined
  readonly onFetch: () => void
  readonly chosen: readonly string[]
  readonly onChange: (chosen: readonly string[]) => void
}

const PARTIAL = `Only the first ${String(MAX_DISTINCT_VALUES)} values are listed: type another one to add it.`

interface Listed {
  // Whether the values of the column are on their way from the host.
  readonly isLoading: boolean
  readonly values: readonly string[]
  readonly toggle: (value: string) => void
  readonly add: (value: string) => void
}

// The values of a list to pick from: those of an enum, or those the column holds (asked of the host
// once), with a search, and a field to add a value that is not listed.
export const ValueChecklist = (props: ValueChecklistProps): ReactElement => {
  const isEnum = props.options.length > 0
  const [search, setSearch] = useState('')
  const listed = useListed(props, search)
  return (
    <div className="filter-list">
      <SearchOrAdd
        search={search}
        canAdd={!isEnum}
        onSearch={setSearch}
        onAdd={(value) => {
          setSearch('')
          listed.add(value)
        }}
      />
      {listed.isLoading ? <p className="popover-text">Loading values…</p> : null}
      <ul className="filter-checklist">
        {listed.values.map((value) => (
          <ValueCheck key={value} value={value} chosen={props.chosen} onToggle={listed.toggle} />
        ))}
      </ul>
      {!isEnum && props.distinct?.isComplete === false ? (
        <p className="popover-note">{PARTIAL}</p>
      ) : null}
    </div>
  )
}

function useListed(props: ValueChecklistProps, search: string): Listed {
  const { options, distinct, onFetch, chosen, onChange } = props
  const isAsked = options.length === 0
  useEffect(() => {
    if (isAsked && distinct === undefined) {
      onFetch()
    }
  }, [isAsked, distinct, onFetch])
  const listed = isAsked ? (distinct?.values ?? []) : options
  return {
    isLoading: isAsked && distinct === undefined,
    values: [...new Set([...chosen, ...listed])].filter((value) => matchesFilter(value, search)),
    toggle: (value) => {
      onChange(
        chosen.includes(value) ? chosen.filter((other) => other !== value) : [...chosen, value],
      )
    },
    add: (value) => {
      onChange([...new Set([...chosen, value])])
    },
  }
}

interface ValueCheckProps {
  readonly value: string
  readonly chosen: readonly string[]
  readonly onToggle: (value: string) => void
}

const ValueCheck = ({ value, chosen, onToggle }: ValueCheckProps): ReactElement => (
  <li>
    <label>
      <input
        type="checkbox"
        checked={chosen.includes(value)}
        onChange={() => {
          onToggle(value)
        }}
      />
      {value === '' ? <span className="look-empty">(empty)</span> : value}
    </label>
  </li>
)

interface SearchOrAddProps {
  readonly search: string
  // A value that is not listed can be added (Alt+Enter): any column but an enum.
  readonly canAdd: boolean
  readonly onSearch: (search: string) => void
  readonly onAdd: (value: string) => void
}

const SearchOrAdd = ({ search, canAdd, onSearch, onAdd }: SearchOrAddProps): ReactElement => (
  <input
    type="search"
    aria-label="Search the values"
    placeholder={canAdd ? 'Search, or Alt+Enter to add' : 'Search'}
    spellCheck={false}
    autoFocus
    value={search}
    onChange={(event) => {
      onSearch(event.target.value)
    }}
    onKeyDown={(event) => {
      if (canAdd && event.key === 'Enter' && event.altKey && search !== '') {
        event.preventDefault()
        event.stopPropagation()
        onAdd(search)
      }
    }}
  />
)
