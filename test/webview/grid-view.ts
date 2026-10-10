// The grid of the result view alone, over the rows of GRID_ROWS: what it asks of the view around it
// (the selection, the cell detail, the view, copying) is recorded.
import { act, render } from '@testing-library/react'
import { createElement } from 'react'
import { type Mock, vi } from 'vitest'

import type { CellPosition, GridSelection } from '../../src/core/grid/selection.ts'
import type { ExportFormat } from '../../src/core/results/export-format.ts'
import type { ResultTab } from '../../src/core/results/protocol.ts'
import type { ViewSpec } from '../../src/core/results/view.ts'
import { Grid } from '../../src/webview/Grid.tsx'
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

export interface GridView {
  readonly api: FakeVsCodeApi
  readonly handlers: GridHandlers
  // The views the grid asked for, in order.
  readonly views: () => ViewSpec[]
}

const NO_EDIT = {
  editor: undefined,
  start: vi.fn(),
  deleteRows: vi.fn(),
  preview: vi.fn(),
}

// A grid of four rows (unless told otherwise), with the rows of GRID_ROWS held.
export function gridView(changes: Partial<ResultTab> = {}, selection?: GridSelection): GridView {
  const api = fakeVsCodeApi()
  const store = new RowStore()
  const handlers: GridHandlers = {
    onSelect: vi.fn(),
    onOpenDetail: vi.fn(),
    onView: vi.fn(),
    onCopy: vi.fn(),
  }
  render(
    createElement(Grid, {
      api,
      tab: resultTab({ rowCount: 4, loadedRows: 4, ...changes }),
      store,
      selection,
      edit: NO_EDIT,
      ...handlers,
    }),
  )
  act(() => {
    store.store(0, 0, GRID_ROWS)
  })
  return { api, handlers, views: () => handlers.onView.mock.calls.map(([view]) => view) }
}
