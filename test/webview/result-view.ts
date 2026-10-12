// The result view of one tab over the rows of GRID_ROWS, as the App shows it: what the host
// answers is given anew on each render, and what the view posts is recorded.
import { act, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'

import type { ResultTab, WebviewMessage } from '../../src/core/results/protocol.ts'
import { type HostAnswers, NO_ANSWERS } from '../../src/webview/host-answers.ts'
import { ResultView } from '../../src/webview/ResultView.tsx'
import { RowStore } from '../../src/webview/row-store.ts'
import type { ViewContext } from '../../src/webview/view-context.ts'
import { WaitIndicator } from '../../src/webview/wait-indicator.ts'
import { resultTab } from '../fixtures/results.ts'
import { GRID_ROWS } from './grid.ts'
import { type FakeVsCodeApi, fakeVsCodeApi } from './vscode-api.ts'

export interface Shown {
  readonly changes?: Partial<ResultTab>
  // The tab the view waits for while this one stays on screen, as changes of the tab shown.
  readonly incoming?: Partial<ResultTab>
  readonly answers?: Partial<HostAnswers>
  readonly context?: Partial<ViewContext>
}

export interface ShownView {
  readonly api: FakeVsCodeApi
  readonly store: RowStore
  readonly rerender: (shown: Shown) => void
  // The messages of a type the view posted, in order.
  readonly sent: (type: string) => WebviewMessage[]
}

export function shownView(shown: Shown = {}): ShownView {
  const api = fakeVsCodeApi()
  const store = new RowStore()
  const base: ViewContext = {
    connection: null,
    sql: null,
    step: null,
    scrolls: new Map(),
    indicator: new WaitIndicator(),
    queryMode: { isOn: false, toggle: () => undefined },
  }
  const element = ({ changes = {}, incoming, answers = {}, context = {} }: Shown): ReactElement =>
    createElement(ResultView, {
      tab: resultTab({ rowCount: 4, loadedRows: 4, ...changes }),
      incoming: incoming === undefined ? undefined : resultTab({ rowCount: 4, ...incoming }),
      store,
      api,
      answers: { ...NO_ANSWERS, ...answers },
      context: { ...base, ...context },
      hasTabs: false,
    })
  const rendered = render(element(shown))
  act(() => {
    store.store(0, 0, GRID_ROWS)
  })
  return {
    api,
    store,
    rerender: (next) => {
      rendered.rerender(element(next))
    },
    sent: (type) => api.posted().filter((message) => message.type === type),
  }
}
