import { useMemo } from 'react'

import { shownColumns } from '../core/grid/column-layout.ts'
import {
  displayColumn,
  projectTab,
  resultMessage,
  type Shown,
} from '../core/grid/column-projection.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import type { HostAnswers } from './host-answers.ts'
import type { ResultsApi } from './results-api.ts'
import { projectedRows, type RowView } from './row-store.ts'

// A tab as the grid shows it, with its rows, what it posts and the answers of the host, all in the
// columns it shows: the grid works with its own columns only.
export interface Projection {
  readonly shown: Shown
  // The tab and the messages in the columns of the result, for what takes them all.
  readonly source: Sources
  readonly tab: ResultTab
  readonly store: RowView
  readonly api: ResultsApi
  readonly answers: HostAnswers
}

export interface Sources {
  readonly tab: ResultTab
  readonly store: RowView
  readonly api: ResultsApi
  readonly answers: HostAnswers
}

export function useProjection({ tab, store, api, answers }: Sources): Projection {
  // Each message of the host brings the tab anew: the columns shown change only when they do.
  const key = shownColumns(tab.columns, tab.layout).join(',')
  const shown = useMemo(() => (key === '' ? [] : key.split(',').map(Number)), [key])
  const projectedTab = useMemo(() => projectTab(tab, shown), [tab, shown])
  const projectedStore = useMemo(() => projectedRows(store, shown), [store, shown])
  const projectedApi = useMemo<ResultsApi>(
    () => ({
      postMessage: (message) => {
        api.postMessage(resultMessage(message, shown, tab.view))
      },
    }),
    [api, shown, tab.view],
  )
  return {
    shown,
    source: { tab, store, api, answers },
    tab: projectedTab,
    store: projectedStore,
    api: projectedApi,
    answers: projectAnswers(answers, shown),
  }
}

// The answers about a column of the result, about the column of the grid that shows it; none for a
// hidden column.
function projectAnswers(answers: HostAnswers, shown: Shown): HostAnswers {
  return {
    ...answers,
    cell: projectColumn(answers.cell, shown),
    peek: projectColumn(answers.peek, shown),
    distinct: projectColumn(answers.distinct, shown),
  }
}

function projectColumn<T extends { readonly column: number }>(
  answer: T | undefined,
  shown: Shown,
): T | undefined {
  const column = answer === undefined ? undefined : displayColumn(shown, answer.column)
  return answer === undefined || column === undefined ? undefined : { ...answer, column }
}
