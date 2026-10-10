import { type KeyboardEvent, type ReactElement, useEffect, useState } from 'react'

import { filterText, withFilter } from '../core/grid/view-state.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import type { ViewSpec } from '../core/results/view.ts'
import type { GridTable } from './use-grid-table.ts'

interface GridHeaderProps {
  readonly table: GridTable
  readonly tab: ResultTab
  readonly isDisabled: boolean
  readonly onView: (view: ViewSpec) => void
}

type Header = ReturnType<GridTable['getFlatHeaders']>[number]

// Typing pauses this long before a filter applies: each change sorts and filters all the rows.
const FILTER_DELAY_MS = 400
const SORT_LABELS: ReadonlyMap<string, 'ascending' | 'descending'> = new Map([
  ['asc', 'ascending'],
  ['desc', 'descending'],
])

// The names of the columns (click to sort, Shift to sort by several, drag the edge to resize) and a
// filter under each.
export const GridHeader = ({ table, tab, isDisabled, onView }: GridHeaderProps): ReactElement => (
  <div className="grid-header" role="rowgroup">
    <div
      className="grid-row header-row"
      role="row"
      aria-rowindex={1}
      style={{ width: table.getTotalSize() }}
    >
      {table.getFlatHeaders().map((header) => (
        <HeaderCell key={header.id} header={header} isDisabled={isDisabled} />
      ))}
    </div>
    <div className="grid-row filter-row" role="row" style={{ width: table.getTotalSize() }}>
      {table.getFlatHeaders().map((header, index) => (
        <FilterCell
          key={`${header.id}:${filterText(tab.view, index)}`}
          name={String(header.column.columnDef.header)}
          width={header.getSize()}
          text={filterText(tab.view, index)}
          isDisabled={isDisabled}
          onCommit={(text) => {
            onView(withFilter(tab.view, index, text))
          }}
        />
      ))}
    </div>
  </div>
)

const HeaderCell = ({
  header,
  isDisabled,
}: {
  readonly header: Header
  readonly isDisabled: boolean
}): ReactElement => (
  <div
    className="grid-cell header-cell"
    role="columnheader"
    aria-sort={SORT_LABELS.get(String(header.column.getIsSorted())) ?? 'none'}
    style={{ width: header.getSize() }}
  >
    <SortButton header={header} isDisabled={isDisabled} />
    <Resizer header={header} />
  </div>
)

const SortButton = ({
  header,
  isDisabled,
}: {
  readonly header: Header
  readonly isDisabled: boolean
}): ReactElement => {
  const sorted = header.column.getIsSorted()
  return (
    <button
      type="button"
      className="sort"
      disabled={isDisabled}
      onClick={header.column.getToggleSortingHandler()}
    >
      {String(header.column.columnDef.header)}
      {sorted === false ? null : (
        <span className="sort-mark">{sorted === 'asc' ? ' ▲' : ' ▼'}</span>
      )}
    </button>
  )
}

const Resizer = ({ header }: { readonly header: Header }): ReactElement => {
  const resize = header.getResizeHandler()
  return (
    <span
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the column"
      onMouseDown={resize}
      onTouchStart={resize}
    />
  )
}

interface FilterCellProps {
  readonly name: string
  readonly width: number
  readonly text: string
  readonly isDisabled: boolean
  readonly onCommit: (text: string) => void
}

// What is typed applies after a pause, or at once with Enter.
function useDraft(
  text: string,
  onCommit: (text: string) => void,
): readonly [string, (draft: string) => void] {
  const [draft, setDraft] = useState(text)
  useEffect(() => {
    if (draft === text) {
      return undefined
    }
    const timer = setTimeout(() => {
      onCommit(draft)
    }, FILTER_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [draft, text, onCommit])
  return [draft, setDraft]
}

const FilterCell = ({ name, width, text, isDisabled, onCommit }: FilterCellProps): ReactElement => {
  const [draft, setDraft] = useDraft(text, onCommit)
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && draft !== text) {
      onCommit(draft)
    }
  }
  return (
    <div className="grid-cell filter-cell" role="gridcell" style={{ width }}>
      <input
        type="search"
        aria-label={`Filter ${name}`}
        placeholder="Filter"
        value={draft}
        disabled={isDisabled}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
