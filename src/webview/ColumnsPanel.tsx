import { type DragEvent, type KeyboardEvent, type ReactElement, useRef, useState } from 'react'

import {
  columnKeys,
  type ColumnLayout,
  DEFAULT_LAYOUT,
  type KeyedColumn,
  orderedColumns,
  withAllHidden,
  withHidden,
  withInverted,
  withMoved,
  withNoneHidden,
} from '../core/grid/column-layout.ts'
import { type ResultTab, WebviewMessageType } from '../core/results/protocol.ts'
import { matchesFilter } from '../core/text/filter.ts'
import { Icon, IconName } from './icons.tsx'
import { KindIcon } from './KindIcon.tsx'
import { type PopupPlace, useDismiss } from './popup.ts'
import type { ResultsApi } from './results-api.ts'

interface ColumnsPanelProps {
  // The tab in the columns of the result: the panel lists them all, hidden ones too.
  readonly tab: ResultTab
  readonly api: ResultsApi
  readonly place: PopupPlace
  readonly onClose: () => void
}

const NOTE =
  'Copy and export take the columns shown, in this order. Hidden columns keep their values.'
const STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowUp', -1],
  ['ArrowDown', 1],
])

// Which columns the grid shows and in which order: a search, a checkbox per column, all, none,
// invert and reset, and a drag (or Alt+Up and Alt+Down) to move one. A table panel keeps what is
// chosen for its table.
export const ColumnsPanel = ({ tab, api, place, onClose }: ColumnsPanelProps): ReactElement => {
  const boxRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  useDismiss(boxRef, true, onClose)
  const setLayout = (layout: ColumnLayout): void => {
    api.postMessage({ type: WebviewMessageType.SetLayout, tabId: tab.id, layout })
  }
  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Columns"
      className="popover columns-panel"
      style={place}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose()
        }
      }}
    >
      <SearchBox search={search} onSearch={setSearch} />
      <LayoutActions tab={tab} onLayout={setLayout} />
      <ColumnList tab={tab} search={search} onLayout={setLayout} />
      <p className="columns-note">{NOTE}</p>
    </div>
  )
}

const SearchBox = ({
  search,
  onSearch,
}: {
  readonly search: string
  readonly onSearch: (search: string) => void
}): ReactElement => (
  <input
    type="search"
    aria-label="Search the columns"
    placeholder="Search columns"
    autoFocus
    value={search}
    onChange={(event) => {
      onSearch(event.target.value)
    }}
  />
)

interface LayoutProps {
  readonly tab: ResultTab
  readonly onLayout: (layout: ColumnLayout) => void
}

const LayoutActions = ({ tab, onLayout }: LayoutProps): ReactElement => {
  const keys = columnKeys(tab.columns)
  const actions: readonly (readonly [string, () => ColumnLayout])[] = [
    ['All', () => withNoneHidden(tab.layout)],
    ['None', () => withAllHidden(keys, tab.layout)],
    ['Invert', () => withInverted(keys, tab.layout)],
    ['Reset', () => DEFAULT_LAYOUT],
  ]
  return (
    <span className="columns-actions">
      {actions.map(([label, layout]) => (
        <button
          key={label}
          type="button"
          className="link-button"
          onClick={() => {
            onLayout(layout())
          }}
        >
          {label}
        </button>
      ))}
    </span>
  )
}

const ColumnList = ({
  tab,
  search,
  onLayout,
}: LayoutProps & { readonly search: string }): ReactElement => {
  const [dragged, setDragged] = useState<string>()
  const columns = orderedColumns(tab.columns, tab.layout)
  const shown = columns.filter(({ key }) => matchesFilter(key, search))
  const move = (key: string, target: number): void => {
    onLayout(withMoved(tab.columns, tab.layout, { key, target }))
  }
  return (
    <ul className="columns-list" aria-label="Columns of the result">
      {shown.map((column) => (
        <ColumnItem
          key={column.key}
          column={column}
          entry={{ tab, position: columns.indexOf(column), canMove: search === '' }}
          drag={{ dragged, setDragged, move }}
          onLayout={onLayout}
        />
      ))}
    </ul>
  )
}

interface Entry {
  readonly tab: ResultTab
  // Where the column is among every column, in the order of the layout.
  readonly position: number
  readonly canMove: boolean
}

interface Drag {
  readonly dragged: string | undefined
  readonly setDragged: (key: string | undefined) => void
  readonly move: (key: string, target: number) => void
}

interface ColumnItemProps {
  readonly column: KeyedColumn
  readonly entry: Entry
  readonly drag: Drag
  readonly onLayout: (layout: ColumnLayout) => void
}

const ColumnItem = ({ column, entry, drag, onLayout }: ColumnItemProps): ReactElement => {
  const { tab, position, canMove } = entry
  const isShown = !tab.layout.hidden.includes(column.key)
  return (
    <li
      className={drag.dragged === column.key ? 'column-item dragging' : 'column-item'}
      draggable={canMove}
      {...dragHandlers(column.key, { position, drag })}
      onKeyDown={(event) => {
        moveByKey(event, { key: column.key, position, drag, canMove })
      }}
    >
      {canMove ? <Icon name={IconName.Grip} /> : null}
      <label>
        <input
          type="checkbox"
          checked={isShown}
          onChange={() => {
            onLayout(withHidden(tab.layout, [column.key], isShown))
          }}
        />
        {tab.columns.slice(column.index, column.index + 1).map(({ kind }) => (
          <KindIcon key={kind} kind={kind} />
        ))}
        <span className="column-name">{column.key}</span>
      </label>
    </li>
  )
}

function dragHandlers(
  key: string,
  { position, drag }: { readonly position: number; readonly drag: Drag },
): Record<string, (event: DragEvent) => void> {
  return {
    onDragStart: () => {
      drag.setDragged(key)
    },
    onDragOver: (event) => {
      event.preventDefault()
    },
    onDrop: (event) => {
      event.preventDefault()
      if (drag.dragged !== undefined) {
        drag.move(drag.dragged, position)
      }
      drag.setDragged(undefined)
    },
    onDragEnd: () => {
      drag.setDragged(undefined)
    },
  }
}

interface KeyMove {
  readonly key: string
  readonly position: number
  readonly drag: Drag
  readonly canMove: boolean
}

// Alt+Up and Alt+Down move the column a place, for those who do not drag.
function moveByKey(event: KeyboardEvent, { key, position, drag, canMove }: KeyMove): void {
  const step = event.altKey && canMove ? STEPS.get(event.key) : undefined
  if (step !== undefined) {
    event.preventDefault()
    drag.move(key, position + step)
  }
}
