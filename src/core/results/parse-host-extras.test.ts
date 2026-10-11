import { describe, expect, it } from 'vitest'

import { POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { resultTab } from '../../../test/fixtures/results.ts'
import { parseHostMessage } from './parse-host-message.ts'
import { TabProgress, TabStatus } from './protocol.ts'

describe('parseHostMessage, beside the tabs', () => {
  it('should read what the catalog says of the columns, the references and the layout', () => {
    const tab = resultTab({
      status: TabStatus.Running,
      progress: TabProgress.Fetching,
      meta: [
        { choices: [], reference: 'condominium (id)' },
        { choices: ['open', 'closed'], reference: '' },
      ],
      references: [{ label: 'account (condominium_id)' }],
      layout: { order: ['name', 'id'], hidden: ['id'] },
    })

    expect(parseHostMessage({ type: 'tab', tab })).toStrictEqual({ type: 'tab', tab })
  })

  it('should read the trail of a table panel', () => {
    const crumbs = [
      { id: 0, label: 'condominium #1', isCurrent: false },
      { id: 3, label: 'account (condominium_id = 1)', isCurrent: true },
    ]

    expect(parseHostMessage({ type: 'trail', crumbs })).toStrictEqual({ type: 'trail', crumbs })
  })

  it('should read the peek of a referenced row', () => {
    const message = {
      type: 'peek',
      tabId: 't',
      viewVersion: 1,
      row: 2,
      column: 3,
      peek: { title: 'condominium #1', columns: ['id', 'name'], values: [1, null], problem: '' },
    }

    expect(parseHostMessage(message)).toStrictEqual(message)
  })

  it('should read the counts of the referencing rows, null where one failed', () => {
    const message = {
      type: 'referenceCounts',
      tabId: 't',
      viewVersion: 1,
      row: 0,
      counts: ['12', null, '0'],
    }

    expect(parseHostMessage(message)).toStrictEqual(message)
  })

  it('should read the values of a column', () => {
    const message = {
      type: 'distinct',
      tabId: 't',
      column: 1,
      values: ['a', 'b'],
      isComplete: false,
    }

    expect(parseHostMessage(message)).toStrictEqual(message)
  })

  it('should read how the SQL of the connection is written', () => {
    const message = {
      type: 'sql',
      identifierQuote: '"',
      lexical: POSTGRES_LEXICAL,
      keywords: ['ILIKE'],
    }

    expect(parseHostMessage(message)).toStrictEqual(message)
  })

  it.each([
    [
      { type: 'tab', tab: { ...resultTab(), progress: 'later' } },
      '"progress" must be a known value',
    ],
    [
      { type: 'tab', tab: { ...resultTab(), meta: [{ choices: [1], reference: '' }] } },
      '"0" must be a string',
    ],
    [{ type: 'tab', tab: { ...resultTab(), layout: { order: [] } } }, '"hidden" must be a list'],
    [
      { type: 'trail', crumbs: [{ id: 'a', label: '', isCurrent: true }] },
      '"id" must be a whole number of 0 or more',
    ],
    [
      { type: 'referenceCounts', tabId: 't', viewVersion: 0, row: 0, counts: [3] },
      '"0" must be a string',
    ],
    [
      {
        type: 'sql',
        identifierQuote: '"',
        lexical: { ...POSTGRES_LEXICAL, hasDollarQuotes: 1 },
        keywords: [],
      },
      '"hasDollarQuotes" must be a boolean',
    ],
  ])('should refuse %j', (data, message) => {
    expect(() => parseHostMessage(data)).toThrow(new TypeError(message))
  })
})
