import { describe, expect, it } from 'vitest'

import { findTables, NOTHING_FOUND } from './found.ts'
import {
  emptyFindText,
  IDLE_STATUS,
  matchBadge,
  type SearchStatus,
  statusLine,
  statusOf,
} from './status.ts'

const SEARCHING: SearchStatus = {
  text: 'ord',
  matchCount: 3,
  connectionCount: 1,
  isLoading: false,
}

describe('statusOf', () => {
  it('should say what the text as typed found', () => {
    const found = findTables(
      [
        {
          connectionId: 'shop',
          hasSchemas: false,
          isLoading: true,
          scopes: [{ scope: { database: 'shop', schema: 'shop' }, tables: ['orders'], views: [] }],
        },
      ],
      'ord',
    )

    expect(statusOf(' ord', found)).toStrictEqual({
      text: ' ord',
      matchCount: 1,
      connectionCount: 1,
      isLoading: true,
    })
  })
})

describe('matchBadge', () => {
  it('should count the matches of the text', () => {
    expect(matchBadge(SEARCHING)).toBe('3')
    expect(matchBadge({ ...SEARCHING, matchCount: 0 })).toBe('No results')
    expect(matchBadge({ ...SEARCHING, matchCount: 0, isLoading: true })).toBe('0')
  })

  it('should start with nothing searched', () => {
    expect(IDLE_STATUS).toStrictEqual({
      text: '',
      matchCount: 0,
      connectionCount: 0,
      isLoading: false,
    })
  })

  it('should show nothing without a text or a connection to search', () => {
    expect(matchBadge({ ...SEARCHING, text: '  ' })).toBe('')
    expect(matchBadge({ ...SEARCHING, connectionCount: 0 })).toBe('')
    expect(matchBadge(IDLE_STATUS)).toBe('')
  })
})

describe('statusLine', () => {
  it('should say that only connected connections are searched', () => {
    expect(statusLine({ ...SEARCHING, connectionCount: 0 })).toBe(
      'Connect to a connection to find its tables.',
    )
  })

  it('should say what to type before anything is typed', () => {
    expect(statusLine({ ...SEARCHING, text: ' ', isLoading: true })).toBe(
      'Type part of the name of a table or view.',
    )
  })

  it('should say that tables are still loading', () => {
    expect(statusLine({ ...SEARCHING, matchCount: 0, isLoading: true })).toBe('Loading tables…')
    expect(statusLine({ ...SEARCHING, matchCount: 1, isLoading: true })).toBe(
      '1 table or view so far, loading tables…',
    )
  })

  it('should say what was found and what the keys do', () => {
    expect(statusLine(SEARCHING)).toBe(
      '3 tables and views: Enter opens the best match, ↓ goes to the tree.',
    )
    expect(statusLine({ ...SEARCHING, matchCount: 0 })).toBe('No table or view matches.')
  })
})

describe('emptyFindText', () => {
  it('should say why the explorer shows no table', () => {
    expect(emptyFindText(NOTHING_FOUND)).toBe('Connect to a connection to find its tables')
    expect(emptyFindText({ ...NOTHING_FOUND, connectionCount: 1, isLoading: true })).toBe(
      'Loading tables…',
    )
    expect(emptyFindText({ ...NOTHING_FOUND, connectionCount: 1 })).toBe('No table or view matches')
  })
})
