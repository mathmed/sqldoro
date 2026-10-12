import { describe, expect, it } from 'vitest'

import { resultTab } from '../../../test/fixtures/results.ts'
import { type ResultTab, TabKind, TabStatus } from '../results/protocol.ts'
import { EMPTY_RESULTS, type ResultsState } from './results-state.ts'
import { isViewReady, tabToShow } from './shown-tab.ts'

const RUNNING = TabStatus.Running

describe('isViewReady', () => {
  it('should be ready once the statement ended and the first rows of the view are here', () => {
    expect(isViewReady(resultTab({ rowCount: 50 }), true)).toBe(true)
    expect(isViewReady(resultTab({ status: TabStatus.Cancelled, rowCount: 50 }), true)).toBe(true)
  })

  it('should wait for the end of a statement whose rows still come', () => {
    expect(isViewReady(resultTab({ status: RUNNING, rowCount: 50 }), true)).toBe(false)
  })

  it('should wait for the rows of a view that has some', () => {
    expect(isViewReady(resultTab({ status: RUNNING, rowCount: 50 }), false)).toBe(false)
    expect(isViewReady(resultTab({ rowCount: 50 }), false)).toBe(false)
  })

  it('should wait while the statement runs and no row came yet', () => {
    expect(isViewReady(resultTab({ status: RUNNING, rowCount: 0 }), false)).toBe(false)
    expect(
      isViewReady(resultTab({ status: RUNNING, rowCount: 0, kind: TabKind.Plan }), false),
    ).toBe(false)
  })

  it('should be ready when the statement ended with nothing to fetch', () => {
    expect(isViewReady(resultTab({ rowCount: 0 }), false)).toBe(true)
    expect(isViewReady(resultTab({ status: TabStatus.Failed, rowCount: 0 }), false)).toBe(true)
    expect(isViewReady(resultTab({ kind: TabKind.Plan, rowCount: 3 }), false)).toBe(true)
  })
})

const BEFORE = resultTab({ id: 'before' })
const NEXT = resultTab({ id: 'next', status: RUNNING })
const OTHER = resultTab({ id: 'other' })

function state(tabs: readonly ResultTab[], activeTabId: string | null): ResultsState {
  return { ...EMPTY_RESULTS, tabs, activeTabId }
}

const READY = (): boolean => true
const NOT_READY = (): boolean => false

describe('tabToShow', () => {
  it('should show the tab in front once it is ready, and keep it as the one to stay', () => {
    const asked: string[] = []

    expect(
      tabToShow(BEFORE, state([NEXT, OTHER], 'next'), (tab) => {
        asked.push(tab.id)
        return true
      }),
    ).toStrictEqual({ tab: NEXT, incoming: undefined, settled: NEXT })
    expect(asked).toStrictEqual(['next'])
  })

  it('should show the first result of a panel as it is', () => {
    expect(tabToShow(undefined, state([NEXT], 'next'), NOT_READY)).toStrictEqual({
      tab: NEXT,
      incoming: undefined,
      settled: undefined,
    })
    expect(tabToShow(undefined, EMPTY_RESULTS, READY)).toStrictEqual({
      tab: undefined,
      incoming: undefined,
      settled: undefined,
    })
  })

  it('should show another tab of the run at once, ready or not', () => {
    expect(tabToShow(BEFORE, state([BEFORE, NEXT], 'next'), NOT_READY)).toStrictEqual({
      tab: NEXT,
      incoming: undefined,
      settled: BEFORE,
    })
  })

  it('should keep the result of before while a new run has no tab yet', () => {
    expect(tabToShow(BEFORE, EMPTY_RESULTS, READY)).toStrictEqual({
      tab: BEFORE,
      incoming: undefined,
      settled: BEFORE,
    })
  })

  it('should keep the result of before until the tab of the new run is ready', () => {
    expect(tabToShow(BEFORE, state([NEXT, OTHER], 'next'), NOT_READY)).toStrictEqual({
      tab: BEFORE,
      incoming: NEXT,
      settled: BEFORE,
    })
  })

  it('should keep the view of before until the rows of the new view of its tab come', () => {
    const refreshed = resultTab({ id: 'before', status: RUNNING, viewVersion: 1 })

    expect(tabToShow(BEFORE, state([refreshed], 'before'), NOT_READY)).toStrictEqual({
      tab: BEFORE,
      incoming: refreshed,
      settled: BEFORE,
    })
  })

  it('should show nothing when the tab in front is not one of the run', () => {
    expect(tabToShow(BEFORE, state([BEFORE], 'gone'), READY)).toStrictEqual({
      tab: undefined,
      incoming: undefined,
      settled: BEFORE,
    })
  })
})
