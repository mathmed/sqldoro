import type { ViewSpec } from '../results/view.ts'

// The sort and the filters of a view as a table library keeps them: column ids, not positions.
export interface ColumnSortState {
  readonly id: string
  readonly isDescending: boolean
}

export interface ColumnFilterState {
  readonly id: string
  readonly value: unknown
}

const COLUMN_ID = /^\d+$/

export function sortingOf(view: ViewSpec): ColumnSortState[] {
  return view.sort.map((key) => ({ id: String(key.column), isDescending: key.isDescending }))
}

export function filtersOf(view: ViewSpec): ColumnFilterState[] {
  return view.filters.map((filter) => ({ id: String(filter.column), value: filter.text }))
}

// Back to a view: ids that are not column positions and filters that are not text are left out.
export function viewOf(
  sorting: readonly ColumnSortState[],
  filters: readonly ColumnFilterState[],
): ViewSpec {
  return {
    sort: sorting
      .filter((sort) => COLUMN_ID.test(sort.id))
      .map((sort) => ({ column: Number(sort.id), isDescending: sort.isDescending })),
    filters: filters.flatMap((filter) =>
      COLUMN_ID.test(filter.id) && typeof filter.value === 'string'
        ? [{ column: Number(filter.id), text: filter.value }]
        : [],
    ),
  }
}

// The view with the filter of `column` set to `text`; an empty text removes it.
export function withFilter(view: ViewSpec, column: number, text: string): ViewSpec {
  const others = view.filters.filter((filter) => filter.column !== column)
  return { sort: view.sort, filters: text === '' ? others : [...others, { column, text }] }
}

export function filterText(view: ViewSpec, column: number): string {
  return view.filters.find((filter) => filter.column === column)?.text ?? ''
}
