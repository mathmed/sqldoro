import type { ColumnFilter } from '../results/conditions.ts'
import type { SortKey, ViewSpec } from '../results/view.ts'

// The sort of a view as a table library keeps it: column ids, not positions.
export interface ColumnSortState {
  readonly id: string
  readonly isDescending: boolean
}

const COLUMN_ID = /^\d+$/

export function sortingOf(view: ViewSpec): ColumnSortState[] {
  return view.sort.map((key) => ({ id: String(key.column), isDescending: key.isDescending }))
}

// Back to the keys of a sort: ids that are not column positions are left out.
export function sortOf(sorting: readonly ColumnSortState[]): SortKey[] {
  return sorting
    .filter((sort) => COLUMN_ID.test(sort.id))
    .map((sort) => ({ column: Number(sort.id), isDescending: sort.isDescending }))
}

// The view with the filters of `column` replaced: they all apply, with those of the other columns.
// No filter removes them.
export function withColumnFilters(
  view: ViewSpec,
  column: number,
  filters: readonly Omit<ColumnFilter, 'column'>[],
): ViewSpec {
  const others = view.filters.filter((filter) => filter.column !== column)
  return {
    sort: view.sort,
    filters: [...others, ...filters.map((filter) => ({ ...filter, column }))],
  }
}

// The filters of a column, in the order they were given.
export function columnFilters(view: ViewSpec, column: number): ColumnFilter[] {
  return view.filters.filter((filter) => filter.column === column)
}

// The view sorted by this column alone, as the menu of its header sorts it.
export function sortedBy(view: ViewSpec, column: number, isDescending: boolean): ViewSpec {
  return { sort: [{ column, isDescending }], filters: view.filters }
}

// The view without the sort of this column; the other columns keep sorting, in their order.
export function withoutSort(view: ViewSpec, column: number): ViewSpec {
  return { sort: view.sort.filter((key) => key.column !== column), filters: view.filters }
}
