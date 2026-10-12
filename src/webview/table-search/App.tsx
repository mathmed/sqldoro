import type { ReactElement } from 'react'

import { matchBadge, statusLine } from '../../core/table-search/status.ts'
import { Icon, IconName } from '../icons.tsx'
import type { SearchApi } from './search-api.ts'
import { type InputRef, type TableSearch, useTableSearch } from './use-table-search.ts'

const PLACEHOLDER = 'Filter tables…'
const CLEAR = 'Clear (Escape)'
const STATUS_ID = 'search-status'

// The search box above the Connections view: a line to type in, and a line that says what to do
// or why nothing shows.
export const App = ({ api }: { readonly api: SearchApi }): ReactElement => {
  const { search, inputRef } = useTableSearch(api)
  return (
    <main className="table-search">
      <SearchField search={search} inputRef={inputRef} />
      <p id={STATUS_ID} className="search-status">
        {statusLine(search.status)}
      </p>
    </main>
  )
}

// What is typed, how many tables and views match it, and a button that clears it.
interface FieldProps {
  readonly search: TableSearch
  readonly inputRef: InputRef
}

const SearchField = ({ search, inputRef }: FieldProps): ReactElement => {
  const { text, status, clear } = search
  const badge = matchBadge(status)
  return (
    <div className="search-field">
      <Icon name={IconName.Search} />
      <SearchInput search={search} inputRef={inputRef} />
      {badge === '' ? null : (
        <span className="search-count" aria-live="polite">
          {badge}
        </span>
      )}
      {text === '' ? null : (
        <button
          type="button"
          className="search-clear"
          title={CLEAR}
          aria-label={CLEAR}
          onClick={clear}
        >
          <Icon name={IconName.Close} />
        </button>
      )}
    </div>
  )
}

const SearchInput = ({ search, inputRef }: FieldProps): ReactElement => (
  <input
    ref={inputRef}
    type="text"
    aria-label="Filter tables and views"
    aria-describedby={STATUS_ID}
    placeholder={PLACEHOLDER}
    spellCheck={false}
    autoComplete="off"
    value={search.text}
    onChange={(event) => {
      search.type(event.target.value)
    }}
    onKeyDown={search.onKeyDown}
    onFocus={search.onFocus}
  />
)
