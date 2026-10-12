import { describe, expect, it } from 'vitest'

import { parseWebviewMessage } from './parse-webview-message.ts'
import { MAX_WINDOW_ROWS } from './protocol.ts'

const RANGE = { firstRow: 0, lastRow: 2, columns: [3, 1] }

describe('parseWebviewMessage', () => {
  it('should read the messages without fields', () => {
    expect(parseWebviewMessage({ type: 'ready' })).toStrictEqual({ type: 'ready' })
    expect(parseWebviewMessage({ type: 'cancel', extra: 1 })).toStrictEqual({ type: 'cancel' })
  })

  it('should read a request to load every row of a tab', () => {
    expect(parseWebviewMessage({ type: 'loadAll', tabId: 't' })).toStrictEqual({
      type: 'loadAll',
      tabId: 't',
    })
    expect(() => parseWebviewMessage({ type: 'loadAll' })).toThrow(
      new TypeError('"tabId" must be a string'),
    )
  })

  it('should read a request to read the rows of a tab again', () => {
    expect(parseWebviewMessage({ type: 'refresh', tabId: 't' })).toStrictEqual({
      type: 'refresh',
      tabId: 't',
    })
    expect(() => parseWebviewMessage({ type: 'refresh', tabId: 1 })).toThrow(
      new TypeError('"tabId" must be a string'),
    )
  })

  it('should read a request to read the rows of a table with a condition', () => {
    expect(
      parseWebviewMessage({ type: 'filterTable', tabId: 't', condition: "status = 'open'" }),
    ).toStrictEqual({ type: 'filterTable', tabId: 't', condition: "status = 'open'" })
    expect(() => parseWebviewMessage({ type: 'filterTable', tabId: 't' })).toThrow(
      new TypeError('"condition" must be a string'),
    )
    expect(() => parseWebviewMessage({ type: 'filterTable', condition: '' })).toThrow(
      new TypeError('"tabId" must be a string'),
    )
  })

  it('should read a quick search of the rows of a tab', () => {
    expect(parseWebviewMessage({ type: 'search', tabId: 't', text: 'ann' })).toStrictEqual({
      type: 'search',
      tabId: 't',
      text: 'ann',
    })
    expect(() => parseWebviewMessage({ type: 'search', tabId: 't', text: 1 })).toThrow(
      new TypeError('"text" must be a string'),
    )
    expect(() => parseWebviewMessage({ type: 'search', text: '' })).toThrow(
      new TypeError('"tabId" must be a string'),
    )
  })

  it('should read a request to copy the name of a column', () => {
    expect(parseWebviewMessage({ type: 'copyColumnName', tabId: 't', column: 2 })).toStrictEqual({
      type: 'copyColumnName',
      tabId: 't',
      column: 2,
    })
    expect(() => parseWebviewMessage({ type: 'copyColumnName', tabId: 't', column: -1 })).toThrow(
      new TypeError('"column" must be a whole number of 0 or more'),
    )
    expect(() => parseWebviewMessage({ type: 'copyColumnName', column: 0 })).toThrow(
      new TypeError('"tabId" must be a string'),
    )
  })

  it('should read a request for rows', () => {
    expect(
      parseWebviewMessage({ type: 'fetchRows', tabId: 't', viewVersion: 2, start: 100, count: 50 }),
    ).toStrictEqual({ type: 'fetchRows', tabId: 't', viewVersion: 2, start: 100, count: 50 })
  })

  it('should refuse to send more rows at once than a window holds', () => {
    const message = { type: 'fetchRows', tabId: 't', viewVersion: 0, start: 0 }

    expect(parseWebviewMessage({ ...message, count: MAX_WINDOW_ROWS })).toMatchObject({
      count: MAX_WINDOW_ROWS,
    })
    expect(() => parseWebviewMessage({ ...message, count: MAX_WINDOW_ROWS + 1 })).toThrow(
      new TypeError('"count" must be at most 1000'),
    )
  })

  it('should read a view with its sort and filters', () => {
    const view = {
      sort: [{ column: 1, isDescending: true }],
      filters: [{ column: 0, operator: 'contains', values: ['a'] }],
    }

    expect(
      parseWebviewMessage({ type: 'setView', tabId: 't', view, isServerSide: true }),
    ).toStrictEqual({ type: 'setView', tabId: 't', view, isServerSide: true })
  })

  it('should read copy, export and cell requests', () => {
    expect(
      parseWebviewMessage({
        type: 'copy',
        tabId: 't',
        viewVersion: 1,
        block: RANGE,
        format: 'tsv',
      }),
    ).toStrictEqual({ type: 'copy', tabId: 't', viewVersion: 1, block: RANGE, format: 'tsv' })
    const oneCell = { firstRow: 2, lastRow: 2, columns: [1] }
    expect(
      parseWebviewMessage({
        type: 'copy',
        tabId: 't',
        viewVersion: 1,
        block: oneCell,
        format: 'csv',
      }),
    ).toMatchObject({ block: oneCell })
    expect(parseWebviewMessage({ type: 'export', tabId: 't', format: 'sql' })).toStrictEqual({
      type: 'export',
      tabId: 't',
      format: 'sql',
    })
    expect(
      parseWebviewMessage({ type: 'fetchCell', tabId: 't', viewVersion: 3, row: 4, column: 5 }),
    ).toStrictEqual({ type: 'fetchCell', tabId: 't', viewVersion: 3, row: 4, column: 5 })
  })

  it('should read the requests to navigate from a row', () => {
    const start = { tabId: 't', viewVersion: 2, row: 7, isInPlace: true }

    expect(parseWebviewMessage({ type: 'navigate', ...start, column: 3 })).toStrictEqual({
      type: 'navigate',
      ...start,
      column: 3,
    })
    expect(parseWebviewMessage({ type: 'openReference', ...start, reference: 1 })).toStrictEqual({
      type: 'openReference',
      ...start,
      reference: 1,
    })
    expect(
      parseWebviewMessage({ type: 'countReferences', tabId: 't', viewVersion: 2, row: 7 }),
    ).toStrictEqual({ type: 'countReferences', tabId: 't', viewVersion: 2, row: 7 })
    expect(
      parseWebviewMessage({ type: 'peek', tabId: 't', viewVersion: 2, row: 7, column: 1 }),
    ).toStrictEqual({ type: 'peek', tabId: 't', viewVersion: 2, row: 7, column: 1 })
    expect(parseWebviewMessage({ type: 'goToStep', step: 4 })).toStrictEqual({
      type: 'goToStep',
      step: 4,
    })
  })

  it('should read the layout of the columns and the other requests of a panel', () => {
    const layout = { order: ['b', 'a'], hidden: ['c'] }

    expect(parseWebviewMessage({ type: 'setLayout', tabId: 't', layout })).toStrictEqual({
      type: 'setLayout',
      tabId: 't',
      layout,
    })
    expect(parseWebviewMessage({ type: 'allowWrites' })).toStrictEqual({ type: 'allowWrites' })
    expect(parseWebviewMessage({ type: 'openInEditor', tabId: 't' })).toStrictEqual({
      type: 'openInEditor',
      tabId: 't',
    })
    expect(parseWebviewMessage({ type: 'fetchDistinct', tabId: 't', column: 2 })).toStrictEqual({
      type: 'fetchDistinct',
      tabId: 't',
      column: 2,
    })
  })

  it('should read what the query box of a table panel asks', () => {
    expect(parseWebviewMessage({ type: 'runQuery', sql: 'SELECT 1' })).toStrictEqual({
      type: 'runQuery',
      sql: 'SELECT 1',
    })
    expect(parseWebviewMessage({ type: 'openSqlInEditor', sql: 'SELECT 2' })).toStrictEqual({
      type: 'openSqlInEditor',
      sql: 'SELECT 2',
    })
    expect(parseWebviewMessage({ type: 'setQueryHeight', height: 4000 })).toStrictEqual({
      type: 'setQueryHeight',
      height: 4000,
    })
  })

  it('should refuse a query box taller than it can be, or a query that is not text', () => {
    expect(() => parseWebviewMessage({ type: 'setQueryHeight', height: 4001 })).toThrow(
      new TypeError('"height" must be at most 4000'),
    )
    expect(() => parseWebviewMessage({ type: 'runQuery', sql: 3 })).toThrow(
      new TypeError('"sql" must be a string'),
    )
  })

  it('should read a problem the webview reports', () => {
    expect(parseWebviewMessage({ type: 'problem', message: 'boom' })).toStrictEqual({
      type: 'problem',
      message: 'boom',
    })
  })

  it.each([
    [null, 'expected an object'],
    [{ type: 'nope' }, '"type" must be a known value'],
    [{}, '"type" must be a string'],
    [{ type: 'export', tabId: 't', format: 'xlsx' }, '"format" must be a known value'],
    [
      { type: 'fetchCell', tabId: 't', viewVersion: 0, row: -1, column: 0 },
      '"row" must be a whole number of 0 or more',
    ],
    [
      { type: 'copy', tabId: 't', viewVersion: 0, block: { ...RANGE, firstRow: 3 }, format: 'csv' },
      '"block" must start before it ends',
    ],
    [
      {
        type: 'copy',
        tabId: 't',
        viewVersion: 0,
        block: { ...RANGE, columns: ['a'] },
        format: 'csv',
      },
      '"0" must be a whole number of 0 or more',
    ],
    [
      { type: 'navigate', tabId: 't', viewVersion: 0, row: 1, column: 2, isInPlace: 'no' },
      '"isInPlace" must be a boolean',
    ],
    [
      { type: 'setLayout', tabId: 't', layout: { order: ['a'], hidden: [1] } },
      '"0" must be a string',
    ],
    [{ type: 'goToStep', step: -1 }, '"step" must be a whole number of 0 or more'],
    [
      {
        type: 'setView',
        tabId: 't',
        view: { sort: [{ column: 0 }], filters: [] },
        isServerSide: false,
      },
      '"isDescending" must be a boolean',
    ],
    [
      {
        type: 'setView',
        tabId: 't',
        view: { sort: [], filters: [{ column: 'a', operator: 'contains', values: [''] }] },
        isServerSide: false,
      },
      '"column" must be a whole number of 0 or more',
    ],
  ])('should refuse %j', (data, message) => {
    expect(() => parseWebviewMessage(data)).toThrow(new TypeError(message))
  })
})
