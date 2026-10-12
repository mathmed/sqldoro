// The result view of a tab whose rows can be edited, over the rows of GRID_ROWS: what the user acts
// on, and what the webview sent the host meanwhile.
import { act, render, screen } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'

import type { PanelConnection } from '../../src/core/results/protocol-parts.ts'
import type { CellMessage, ResultTab } from '../../src/core/results/protocol.ts'
import type { TabEditing } from '../../src/core/results/tab-editing.ts'
import { NO_ANSWERS } from '../../src/webview/host-answers.ts'
import { ResultView } from '../../src/webview/ResultView.tsx'
import { RowStore } from '../../src/webview/row-store.ts'
import { WaitIndicator } from '../../src/webview/wait-indicator.ts'
import { editableTab } from '../fixtures/results.ts'
import { GRID_ROWS, theGrid } from './grid.ts'
import { fakeVsCodeApi } from './vscode-api.ts'

export interface Shown {
  readonly editing?: Partial<TabEditing>
  readonly changes?: Partial<ResultTab>
  readonly cell?: CellMessage
  readonly connection?: PanelConnection
}

export interface EditingView {
  readonly rerender: (shown: Shown) => void
  readonly sent: (type: string) => unknown[]
}

const EDITOR_NAME = /^New value of /

export function editingView(shown: Shown = {}): EditingView {
  const api = fakeVsCodeApi()
  const store = new RowStore()
  const indicator = new WaitIndicator()
  const element = ({ editing = {}, changes = {}, cell, connection }: Shown): ReactElement =>
    createElement(ResultView, {
      tab: editableTab(editing, changes),
      store,
      api,
      answers: { ...NO_ANSWERS, cell },
      incoming: undefined,
      context: {
        connection: connection ?? null,
        sql: null,
        step: null,
        scrolls: new Map(),
        indicator,
        queryMode: { isOn: false, toggle: () => undefined },
      },
      hasTabs: false,
    })
  const rendered = render(element(shown))
  act(() => {
    store.store(0, 0, GRID_ROWS)
  })
  return {
    rerender: (next) => {
      rendered.rerender(element(next))
    },
    sent: (type) => api.posted().filter((message) => message.type === type),
  }
}

// The edit message of a value typed in one cell.
export function setEdit(row: number, column: number, input: string): object {
  return {
    type: 'edit',
    tabId: 'tab-1',
    viewVersion: 0,
    edit: { kind: 'set', block: { firstRow: row, lastRow: row, columns: [column] }, input },
  }
}

export function theEditor(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: EDITOR_NAME })
}

export function hasEditor(): boolean {
  return screen.queryByRole('textbox', { name: EDITOR_NAME }) !== null
}

// The cell with the focus, by its id.
export function focused(): string | null {
  return theGrid().getAttribute('aria-activedescendant')
}

// A row of the grid by its position in the grid: the header comes first.
export function gridRow(row: number): HTMLElement | undefined {
  return screen.getAllByRole('row').at(row + 1)
}
