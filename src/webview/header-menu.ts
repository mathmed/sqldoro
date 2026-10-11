import type { ResultColumn } from '../core/engine/query.ts'
import { sortedBy, withoutSort } from '../core/grid/view-state.ts'
import type { DistinctMessage, ResultTab } from '../core/results/protocol.ts'
import type { ViewSpec } from '../core/results/view.ts'
import type { MenuItem } from './Menu.tsx'
import type { GridTable } from './use-grid-table.ts'

export type Header = ReturnType<GridTable['getFlatHeaders']>[number]

// What the header of a column does: change the view, open the filter of a column, copy its name.
export interface HeaderActions {
  readonly tab: ResultTab
  // While the statement runs, the view waits.
  readonly isDisabled: boolean
  readonly onView: (view: ViewSpec) => void
  readonly onFilter: (index: number, column: ResultColumn) => void
  readonly onCopyName: (column: number) => void
  readonly onHide: (column: number) => void
  // Asks the host for the values a column holds, for its filter to list.
  readonly onFetchDistinct: (column: number) => void
  // The last values the host listed for a column of the grid.
  readonly distinct: DistinctMessage | undefined
}

interface MenuTarget {
  // The position of the column in the result.
  readonly index: number
  readonly column: ResultColumn
  readonly actions: HeaderActions
}

// The menu of the header of a column: its sort, its filter, its name, and hiding it.
export function columnMenu(header: Header, target: MenuTarget): MenuItem[] {
  return [...sortItems(header, target), ...otherItems(target)]
}

// Sorting by the column alone, either way, or not by it any more.
function sortItems(header: Header, { index, actions }: MenuTarget): MenuItem[] {
  const { tab, onView, isDisabled } = actions
  const sortBy = (isDescending: boolean) => () => {
    onView(sortedBy(tab.view, index, isDescending))
  }
  return [
    { label: 'Sort ascending', isDisabled, onSelect: sortBy(false) },
    { label: 'Sort descending', isDisabled, onSelect: sortBy(true) },
    {
      label: 'Clear sort',
      isDisabled: isDisabled || header.column.getIsSorted() === false,
      onSelect: () => {
        onView(withoutSort(tab.view, index))
      },
    },
  ]
}

function otherItems({ index, column, actions }: MenuTarget): MenuItem[] {
  return [
    {
      label: 'Filter…',
      isDisabled: actions.isDisabled,
      onSelect: () => {
        actions.onFilter(index, column)
      },
    },
    {
      label: 'Copy column name',
      isDisabled: false,
      onSelect: () => {
        actions.onCopyName(index)
      },
    },
    {
      label: 'Hide column',
      isDisabled: false,
      onSelect: () => {
        actions.onHide(index)
      },
    },
  ]
}
