import { describe, expect, it } from 'vitest'

import { resultTab } from '../../../test/fixtures/results.ts'
import { parseHostMessage } from './parse-host-message.ts'
import { TabKind, TabStatus } from './protocol.ts'

describe('parseHostMessage', () => {
  it('should read the tabs of a run', () => {
    const tabs = [
      resultTab(),
      resultTab({ id: 'tab-2', summary: null, error: { message: 'x', line: 2, column: null } }),
    ]

    expect(parseHostMessage({ type: 'tabs', tabs, activeTabId: 'tab-2' })).toStrictEqual({
      type: 'tabs',
      tabs,
      activeTabId: 'tab-2',
    })
    expect(parseHostMessage({ type: 'tabs', tabs: [], activeTabId: null })).toStrictEqual({
      type: 'tabs',
      tabs: [],
      activeTabId: null,
    })
  })

  it('should read one tab with every field', () => {
    const tab = resultTab({
      kind: TabKind.Plan,
      status: TabStatus.Cancelled,
      plan: ['Seq Scan'],
      summary: { durationMs: 3, affectedRows: 7, isTruncated: true },
      error: { message: 'bad', line: 1, column: 4 },
      notice: '1 statement not run',
      view: { sort: [{ column: 0, isDescending: false }], filters: [{ column: 1, text: 'a' }] },
    })

    expect(parseHostMessage({ type: 'tab', tab })).toStrictEqual({ type: 'tab', tab })
  })

  it('should read a window of rows and a cell value', () => {
    const rows = [
      { cells: [1, 'a', null, true], truncated: [] },
      { cells: ['long…', 2.5, false, ''], truncated: [0] },
    ]

    expect(
      parseHostMessage({ type: 'rows', tabId: 't', viewVersion: 1, start: 40, rows }),
    ).toStrictEqual({
      type: 'rows',
      tabId: 't',
      viewVersion: 1,
      start: 40,
      rows,
    })
    expect(
      parseHostMessage({
        type: 'cell',
        tabId: 't',
        viewVersion: 1,
        row: 2,
        column: 3,
        value: null,
      }),
    ).toStrictEqual({ type: 'cell', tabId: 't', viewVersion: 1, row: 2, column: 3, value: null })
  })

  it.each([
    [{ type: 'other' }, '"type" must be a known value'],
    [{ type: 'tab', tab: { ...resultTab(), status: 'done' } }, '"status" must be a known value'],
    [{ type: 'tab', tab: { ...resultTab(), kind: 'chart' } }, '"kind" must be a known value'],
    [
      {
        type: 'tab',
        tab: { ...resultTab(), columns: [{ name: 'a', dataType: 'X', kind: 'date' }] },
      },
      '"kind" must be a known value',
    ],
    [{ type: 'tab', tab: { ...resultTab(), plan: [1] } }, '"0" must be a string'],
    [
      {
        type: 'tab',
        tab: { ...resultTab(), summary: { durationMs: 1, affectedRows: -1, isTruncated: false } },
      },
      '"affectedRows" must be a whole number of 0 or more',
    ],
    [
      {
        type: 'rows',
        tabId: 't',
        viewVersion: 0,
        start: 0,
        rows: [{ cells: [{}], truncated: [] }],
      },
      '"cells" must hold cell values',
    ],
    [
      {
        type: 'rows',
        tabId: 't',
        viewVersion: 0,
        start: 0,
        rows: [{ cells: [], truncated: ['a'] }],
      },
      '"0" must be a whole number of 0 or more',
    ],
    [
      { type: 'cell', tabId: 't', viewVersion: 0, row: 0, column: 0, value: [1] },
      '"value" must be a cell value',
    ],
    [
      { type: 'cell', tabId: 't', viewVersion: 0, row: 0, column: 0 },
      '"value" must be a cell value',
    ],
  ])('should refuse %j', (data, message) => {
    expect(() => parseHostMessage(data)).toThrow(new TypeError(message))
  })
})
