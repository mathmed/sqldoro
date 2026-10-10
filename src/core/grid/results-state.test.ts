import { describe, expect, it } from 'vitest'

import { resultTab } from '../../../test/fixtures/results.ts'
import { activateTab, activeTab, EMPTY_RESULTS, reduceResults } from './results-state.ts'

const FIRST = resultTab({ id: 'a' })
const SECOND = resultTab({ id: 'b' })
const THIRD = resultTab({ id: 'c' })

describe('reduceResults', () => {
  it('should replace the tabs with a run, in front the one the host says or the last', () => {
    expect(
      reduceResults(EMPTY_RESULTS, { type: 'tabs', tabs: [FIRST, SECOND], activeTabId: 'a' }),
    ).toStrictEqual({
      tabs: [FIRST, SECOND],
      activeTabId: 'a',
    })
    expect(
      reduceResults(EMPTY_RESULTS, {
        type: 'tabs',
        tabs: [FIRST, SECOND, THIRD],
        activeTabId: null,
      }),
    ).toMatchObject({
      activeTabId: 'c',
    })
    expect(
      reduceResults(
        { tabs: [FIRST], activeTabId: 'a' },
        { type: 'tabs', tabs: [], activeTabId: null },
      ),
    ).toStrictEqual(EMPTY_RESULTS)
  })

  it('should add a new tab in front', () => {
    const state = { tabs: [FIRST], activeTabId: 'a' }

    expect(reduceResults(state, { type: 'tab', tab: SECOND })).toStrictEqual({
      tabs: [FIRST, SECOND],
      activeTabId: 'b',
    })
  })

  it('should update a known tab where it is, without bringing it to the front', () => {
    const state = { tabs: [FIRST, SECOND], activeTabId: 'b' }
    const changed = resultTab({ id: 'a', rowCount: 99 })

    expect(reduceResults(state, { type: 'tab', tab: changed })).toStrictEqual({
      tabs: [changed, SECOND],
      activeTabId: 'b',
    })
  })

  it('should keep the state for rows and cells', () => {
    const state = { tabs: [FIRST], activeTabId: 'a' }

    expect(
      reduceResults(state, { type: 'rows', tabId: 'a', viewVersion: 0, start: 0, rows: [] }),
    ).toBe(state)
    expect(
      reduceResults(state, {
        type: 'cell',
        tabId: 'a',
        viewVersion: 0,
        row: 0,
        column: 0,
        value: null,
      }),
    ).toBe(state)
  })
})

describe('activateTab and activeTab', () => {
  const state = { tabs: [FIRST, SECOND], activeTabId: 'a' }

  it('should bring a known tab to the front and ignore an unknown one', () => {
    expect(activateTab(state, 'b').activeTabId).toBe('b')
    expect(activateTab(state, 'zzz')).toBe(state)
  })

  it('should find the tab in front', () => {
    expect(activeTab(state)).toBe(FIRST)
    expect(activeTab({ ...state, activeTabId: 'b' })).toBe(SECOND)
    expect(activeTab(EMPTY_RESULTS)).toBeUndefined()
  })
})
