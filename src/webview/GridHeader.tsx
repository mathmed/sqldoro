import { type ReactElement, useState } from 'react'

import type { ResultColumn } from '../core/engine/query.ts'
import { columnFilters, withColumnFilters } from '../core/grid/view-state.ts'
import { describeFilter } from '../core/results/conditions.ts'
import type { DistinctMessage, ResultTab } from '../core/results/protocol.ts'
import type { ColumnMeta } from '../core/results/tab-meta.ts'
import type { ViewSpec } from '../core/results/view.ts'
import { FilterPopover } from './FilterPopover.tsx'
import { ariaColumnIndex, filterButtonId, pairs } from './grid-model.ts'
import { ColumnSpacer } from './GridRows.tsx'
import { columnMenu, type Header, type HeaderActions } from './header-menu.ts'
import { Icon, IconName } from './icons.tsx'
import { KindIcon, kindName } from './KindIcon.tsx'
import { MenuButton } from './Menu.tsx'
import { placeUnder, type PopupPlace } from './popup.ts'
import type { ColumnWindow } from './use-column-window.ts'
import type { GridTable } from './use-grid-table.ts'

interface GridHeaderProps {
  readonly table: GridTable
  readonly tab: ResultTab
  // The columns in the page, as in the rows.
  readonly shown: ColumnWindow
  // The width of the row numbers, on the left.
  readonly gutter: number
  readonly isDisabled: boolean
  readonly onView: (view: ViewSpec) => void
  readonly onCopyName: (column: number) => void
  readonly onHide: (column: number) => void
  readonly onFetchDistinct: (column: number) => void
  readonly distinct: DistinctMessage | undefined
}

// The filter open under the header of a column.
interface Filtering {
  readonly index: number
  readonly column: ResultColumn
  readonly place: PopupPlace
}

const SORT_LABELS: ReadonlyMap<string, 'ascending' | 'descending'> = new Map([
  ['asc', 'ascending'],
  ['desc', 'descending'],
])
const SORT_MARKS: ReadonlyMap<string, string> = new Map([
  ['asc', '▲'],
  ['desc', '▼'],
])

// The names of the columns, each with the kind of its values, its filter and a menu: a click sorts,
// Shift adds a column to the sort, the edge resizes the column. A column's filter opens under it.
export const GridHeader = (props: GridHeaderProps): ReactElement => {
  const { table, tab, shown, gutter } = props
  const [filtering, setFiltering] = useState<Filtering>()
  const actions: HeaderActions = {
    ...props,
    onFilter: (index, column) => {
      const anchor = document.getElementById(filterButtonId(tab.id, index))
      setFiltering({ index, column, place: placeUnder(anchor) })
    },
  }
  return (
    <div className="grid-header" role="rowgroup">
      <HeaderRow table={table} shown={shown} gutter={gutter} actions={actions} />
      <HeaderFilter filtering={filtering} actions={actions} onEnd={setFiltering} />
    </div>
  )
}

// The corner above the row numbers, then the headers of the columns in the page.
interface HeaderRowProps extends Pick<GridHeaderProps, 'gutter' | 'shown' | 'table'> {
  readonly actions: HeaderActions
}

const HeaderRow = ({ table, shown, gutter, actions }: HeaderRowProps): ReactElement => {
  const headers = table.getFlatHeaders().slice(shown.first, shown.last + 1)
  const columns = pairs(headers, actions.tab.columns.slice(shown.first, shown.last + 1))
  return (
    <div
      className="grid-row header-row"
      role="row"
      aria-rowindex={1}
      style={{ width: gutter + table.getTotalSize() }}
    >
      <div className="row-number corner" aria-hidden="true" style={{ width: gutter }} />
      <ColumnSpacer width={shown.before} />
      {columns.map(([header, column], shift) => (
        <HeaderCell
          key={header.id}
          header={header}
          column={column}
          index={shown.first + shift}
          actions={actions}
        />
      ))}
    </div>
  )
}

interface HeaderFilterProps {
  readonly filtering: Filtering | undefined
  readonly actions: HeaderActions
  readonly onEnd: (filtering: undefined) => void
}

// The filter of a column, under its header, while it is open.
const HeaderFilter = ({ filtering, actions, onEnd }: HeaderFilterProps): ReactElement | null => {
  return filtering === undefined ? null : (
    <ColumnFilterPopover filtering={filtering} actions={actions} onEnd={onEnd} />
  )
}

const ColumnFilterPopover = ({
  filtering,
  actions,
  onEnd,
}: HeaderFilterProps & { readonly filtering: Filtering }): ReactElement => {
  const { tab, onView } = actions
  const { index, column } = filtering
  return (
    <FilterPopover
      key={index}
      column={{ ...column, choices: tab.meta.at(index)?.choices ?? [] }}
      filters={columnFilters(tab.view, index)}
      distinct={distinctOf(actions, index)}
      onFetchDistinct={() => {
        actions.onFetchDistinct(index)
      }}
      place={filtering.place}
      onApply={(filters) => {
        onView(withColumnFilters(tab.view, index, filters))
      }}
      {...closers(filterButtonId(tab.id, index), onEnd)}
    />
  )
}

// Closed from the keyboard or its buttons, the filter gives the focus back to its button; a click
// elsewhere leaves the focus where it went.
function closers(
  buttonId: string,
  onEnd: (filtering: undefined) => void,
): { readonly onClose: () => void; readonly onDismiss: () => void } {
  return {
    onClose: () => {
      onEnd(undefined)
      document.getElementById(buttonId)?.focus()
    },
    onDismiss: () => {
      onEnd(undefined)
    },
  }
}

// The values the host listed for this column of this tab; undefined before it answers.
function distinctOf({ distinct, tab }: HeaderActions, column: number): DistinctMessage | undefined {
  return distinct?.tabId === tab.id && distinct.column === column ? distinct : undefined
}

interface HeaderCellProps {
  readonly header: Header
  readonly column: ResultColumn
  // The position of the column in the result.
  readonly index: number
  readonly actions: HeaderActions
}

const HeaderCell = ({ header, column, index, actions }: HeaderCellProps): ReactElement => (
  <div
    className="grid-cell header-cell"
    role="columnheader"
    aria-colindex={ariaColumnIndex(index)}
    aria-sort={SORT_LABELS.get(String(header.column.getIsSorted())) ?? 'none'}
    style={{ width: header.getSize() }}
  >
    <SortButton header={header} column={column} index={index} actions={actions} />
    <FilterButton column={column} index={index} actions={actions} />
    <MenuButton
      label={`Actions of ${column.name}`}
      tooltip={`Actions of ${column.name}`}
      icon={IconName.More}
      items={columnMenu(header, { index, column, actions })}
      isDisabled={false}
      hasChevron={false}
    />
    <Resizer header={header} />
  </div>
)

// The kind of the column, its name, and the arrow of its sort (with its place in a sort by several).
const SortButton = ({ header, column, index, actions }: HeaderCellProps): ReactElement => {
  const mark = SORT_MARKS.get(String(header.column.getIsSorted()))
  return (
    <button
      type="button"
      className="sort"
      title={columnTooltip(column, actions.tab.meta.at(index))}
      disabled={actions.isDisabled}
      onClick={header.column.getToggleSortingHandler()}
    >
      <KindIcon kind={column.kind} />
      <span className="column-name">{column.name}</span>
      {mark === undefined ? null : (
        <span className="sort-mark">{` ${mark}${sortOrder(actions.tab.view, index)}`}</span>
      )}
    </button>
  )
}

const MAX_LISTED_CHOICES = 20

// What the column holds, the values of an enum, what its foreign key points at, and how to sort.
function columnTooltip(column: ResultColumn, meta: ColumnMeta | undefined): string {
  return [
    `${column.name}: ${column.dataType} (${kindName(column.kind)})`,
    choicesLine(meta?.choices ?? []),
    meta === undefined || meta.reference === '' ? '' : `References ${meta.reference}`,
    'Click to sort, Shift+click to sort by it too.',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function choicesLine(choices: readonly string[]): string {
  if (choices.length === 0) {
    return ''
  }
  const listed = choices.slice(0, MAX_LISTED_CHOICES).join(', ')
  return `Values: ${listed}${choices.length > MAX_LISTED_CHOICES ? ', …' : ''}`
}

function sortOrder(view: ViewSpec, column: number): string {
  return view.sort.length > 1 ? String(view.sort.findIndex((key) => key.column === column) + 1) : ''
}

// Highlighted while the column is filtered.
const FilterButton = ({
  column,
  index,
  actions,
}: Omit<HeaderCellProps, 'header'>): ReactElement => {
  const filters = columnFilters(actions.tab.view, index)
  const text = filters.map((filter) => `${column.name} ${describeFilter(filter)}`).join(' and ')
  return (
    <button
      type="button"
      id={filterButtonId(actions.tab.id, index)}
      className={text === '' ? 'header-action' : 'header-action is-active'}
      aria-label={`Filter ${column.name}`}
      title={text === '' ? `Filter ${column.name}` : `Filtered: ${text}`}
      disabled={actions.isDisabled}
      onClick={() => {
        actions.onFilter(index, column)
      }}
    >
      <Icon name={IconName.Filter} />
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
