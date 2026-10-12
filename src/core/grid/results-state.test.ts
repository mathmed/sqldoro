import { describe, expect, it } from 'vitest'

import { POSTGRES_LEXICAL as EMPTY_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { resultTab } from '../../../test/fixtures/results.ts'
import { activateTab, activeTab, EMPTY_RESULTS, reduceResults } from './results-state.ts'

const SHOP = { name: 'Shop', environment: 'prod', isProduction: true, isReadOnly: false, color: '' }
const FIRST = resultTab({ id: 'a' })
const SECOND = resultTab({ id: 'b' })
const THIRD = resultTab({ id: 'c' })

describe('reduceResults', () => {
  it('should keep what the query box of a table panel works with', () => {
    expect(
      reduceResults(EMPTY_RESULTS, { type: 'queryBox', tables: ['orders'], height: 120 }),
    ).toStrictEqual({ ...EMPTY_RESULTS, queryBox: { tables: ['orders'], height: 120 } })
    expect(EMPTY_RESULTS.queryBox).toStrictEqual({ tables: [], height: null })
  })

  it('should replace the tabs with a run, in front the one the host says or the last', () => {
    expect(
      reduceResults(EMPTY_RESULTS, { type: 'tabs', tabs: [FIRST, SECOND], activeTabId: 'a' }),
    ).toStrictEqual({
      ...EMPTY_RESULTS,
      tabs: [FIRST, SECOND],
      activeTabId: 'a',
      hasHeardTabs: true,
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
        { ...EMPTY_RESULTS, connection: SHOP, tabs: [FIRST], activeTabId: 'a' },
        { type: 'tabs', tabs: [], activeTabId: null },
      ),
    ).toStrictEqual({ ...EMPTY_RESULTS, connection: SHOP, hasHeardTabs: true })
  })

  it('should add a new tab in front', () => {
    const state = { ...EMPTY_RESULTS, connection: SHOP, tabs: [FIRST], activeTabId: 'a' }

    expect(reduceResults(state, { type: 'tab', tab: SECOND })).toStrictEqual({
      ...EMPTY_RESULTS,
      connection: SHOP,
      tabs: [FIRST, SECOND],
      activeTabId: 'b',
      hasHeardTabs: true,
    })
  })

  it('should update a known tab where it is, without bringing it to the front', () => {
    const state = { ...EMPTY_RESULTS, tabs: [FIRST, SECOND], activeTabId: 'b' }
    const changed = resultTab({ id: 'a', rowCount: 99 })

    expect(reduceResults(state, { type: 'tab', tab: changed })).toStrictEqual({
      ...EMPTY_RESULTS,
      tabs: [changed, SECOND],
      activeTabId: 'b',
      hasHeardTabs: true,
    })
  })

  it('should show the connection of the editor, whatever the tabs', () => {
    const state = { ...EMPTY_RESULTS, tabs: [FIRST], activeTabId: 'a' }

    expect(reduceResults(state, { type: 'connection', connection: SHOP })).toStrictEqual({
      ...EMPTY_RESULTS,
      connection: SHOP,
      tabs: [FIRST],
      activeTabId: 'a',
    })
    expect(
      reduceResults(EMPTY_RESULTS, { type: 'connection', connection: SHOP }).hasHeardTabs,
    ).toBe(false)
  })

  it('should keep the trail of a table panel and how the SQL is written', () => {
    const crumbs = [{ id: 0, label: 'orders', isCurrent: true, isQuery: false }]
    const lexical = { ...EMPTY_LEXICAL }

    expect(reduceResults(EMPTY_RESULTS, { type: 'trail', crumbs })).toStrictEqual({
      ...EMPTY_RESULTS,
      crumbs,
    })
    expect(
      reduceResults(EMPTY_RESULTS, {
        type: 'sql',
        identifierQuote: '"',
        lexical,
        keywords: ['ILIKE'],
      }),
    ).toStrictEqual({
      ...EMPTY_RESULTS,
      sql: { identifierQuote: '"', lexical, keywords: ['ILIKE'] },
    })
  })

  it('should keep the state for rows and cells', () => {
    const state = { ...EMPTY_RESULTS, tabs: [FIRST], activeTabId: 'a' }

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
  const state = { ...EMPTY_RESULTS, tabs: [FIRST, SECOND], activeTabId: 'a' }

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
