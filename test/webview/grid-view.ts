// The grid of the result view alone, over the rows of GRID_ROWS: what it asks of the view around it
// (the selection, the cell detail, the view, copying) is recorded.
import { act, render } from '@testing-library/react'
import { createElement } from 'react'
import { type Mock, vi } from 'vitest'

import type { CellPosition, GridSelection } from '../../src/core/grid/selection.ts'
import type { ExportFormat } from '../../src/core/results/export-format.ts'
import type { DistinctMessage, ResultTab } from '../../src/core/results/protocol.ts'
import type { ViewSpec } from '../../src/core/results/view.ts'
import { Grid } from '../../src/webview/Grid.tsx'
import { linkActions } from '../../src/webview/link-actions.ts'
import type { PopupPlace } from '../../src/webview/popup.ts'
import { RowStore } from '../../src/webview/row-store.ts'
import { resultTab } from '../fixtures/results.ts'
import { GRID_ROWS } from './grid.ts'
import { type FakeVsCodeApi, fakeVsCodeApi } from './vscode-api.ts'

interface GridHandlers {
  readonly onSelect: Mock<(selection: GridSelection) => void>
  readonly onOpenDetail: Mock<(position: CellPosition) => void>
  readonly onView: Mock<(view: ViewSpec) => void>
  readonly onCopy: Mock<(format: ExportFormat) => void>
}

// What the links of the grid, the menu of a cell and the headers ask for.
interface GridAsks {
  readonly open: Mock<(position: CellPosition, isInPlace: boolean) => void>
  readonly onPeek: Mock<(position: CellPosition, place: PopupPlace) => void>
  readonly onCellMenu: Mock<(position: CellPosition, place: PopupPlace) => void>
  readonly onHide: Mock<(column: number) => void>
  readonly onFetchDistinct: Mock<(column: number) => void>
}

export interface GridView {
  readonly api: FakeVsCodeApi
  readonly handlers: GridHandlers
  readonly asks: GridAsks
  readonly scrolls: Map<number, number>
  // The views the grid asked for, in order.
  readonly views: () => ViewSpec[]
}

const NO_EDIT = {
  editor: undefined,
  start: vi.fn(),
  deleteRows: vi.fn(),
  preview: vi.fn(),
}

export interface GridOptions {
  readonly selection?: GridSelection | undefined
  // The step of a trail the grid shows, and where the grids of the steps were scrolled to.
  readonly step?: number
  readonly scrolls?: Map<number, number>
  readonly distinct?: DistinctMessage
}

function asksOf(): GridAsks {
  return {
    open: vi.fn(),
    onPeek: vi.fn(),
    onCellMenu: vi.fn(),
    onHide: vi.fn(),
    onFetchDistinct: vi.fn(),
  }
}

// A grid of four rows (unless told otherwise), with the rows of GRID_ROWS held.
export function gridView(changes: Partial<ResultTab> = {}, options: GridOptions = {}): GridView {
  const api = fakeVsCodeApi()
  const store = new RowStore()
  const handlers: GridHandlers = {
    onSelect: vi.fn(),
    onOpenDetail: vi.fn(),
    onView: vi.fn(),
    onCopy: vi.fn(),
  }
  const asks = asksOf()
  const tab = resultTab({ rowCount: 4, loadedRows: 4, ...changes })
  const scrolls = options.scrolls ?? new Map<number, number>()
  render(
    createElement(Grid, {
      api,
      tab,
      store,
      fetching: tab,
      selection: options.selection,
      edit: NO_EDIT,
      ...handlers,
      links: { actions: { ...linkActions(api, tab), open: asks.open }, ...asks },
      columns: { ...asks, distinct: options.distinct },
      scroll: { step: options.step ?? null, scrolls },
    }),
  )
  act(() => {
    store.store(0, 0, GRID_ROWS)
  })
  return {
    api,
    handlers,
    asks,
    scrolls,
    views: () => handlers.onView.mock.calls.map(([view]) => view),
  }
}
