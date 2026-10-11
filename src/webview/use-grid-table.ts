import {
  columnResizingFeature,
  columnSizingFeature,
  functionalUpdate,
  type ReactTable,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  type TableState,
  useTable,
} from '@tanstack/react-table'
import { useMemo } from 'react'

import { sortingOf, sortOf } from '../core/grid/view-state.ts'
import type { ResultTab, WireRow } from '../core/results/protocol.ts'
import type { ViewSpec } from '../core/results/view.ts'
import { initialWidth } from './grid-model.ts'

// The table gives the grid its columns, their widths (and resizing) and the sort state; the rows
// stay with the extension host, which sorts and filters them.
const FEATURES = tableFeatures({ columnSizingFeature, columnResizingFeature, rowSortingFeature })
const NO_ROWS: readonly WireRow[] = []
const MIN_COLUMN_WIDTH = 50
const MAX_COLUMN_WIDTH = 2000

export type GridTable = ReactTable<typeof FEATURES, WireRow, TableState<typeof FEATURES>>

// The table never reads a value (it holds no rows): the accessor key only makes the column sortable.
function columnDefs(tab: ResultTab): GridColumns {
  return tab.columns.map((column, index) => ({
    id: String(index),
    header: column.name,
    accessorKey: 'cells',
    size: initialWidth(column),
    minSize: MIN_COLUMN_WIDTH,
    maxSize: MAX_COLUMN_WIDTH,
  }))
}

type GridColumns = readonly {
  readonly id: string
  readonly header: string
  readonly accessorKey: 'cells'
  readonly size: number
  readonly minSize: number
  readonly maxSize: number
}[]

export function useGridTable(tab: ResultTab, onView: (view: ViewSpec) => void): GridTable {
  const columns = useMemo(() => columnDefs(tab), [tab])
  const sorting = useMemo(
    () => sortingOf(tab.view).map((sort) => ({ id: sort.id, desc: sort.isDescending })),
    [tab.view],
  )
  return useTable({
    features: FEATURES,
    columns,
    data: NO_ROWS,
    manualSorting: true,
    enableMultiSort: true,
    // The table holds no rows to guess a direction from: a first click always sorts ascending.
    sortDescFirst: false,
    columnResizeMode: 'onChange',
    state: { sorting },
    onSortingChange: (updater) => {
      const next: SortingState = functionalUpdate(updater, sorting)
      const sort = sortOf(next.map((key) => ({ id: key.id, isDescending: key.desc })))
      onView({ sort, filters: tab.view.filters })
    },
  })
}
