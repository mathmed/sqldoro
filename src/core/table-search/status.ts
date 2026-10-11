import type { FoundTables } from './found.ts'

// Where finding a table stands, for the search box: the text as typed and what it found.
export interface SearchStatus {
  readonly text: string
  readonly matchCount: number
  readonly connectionCount: number
  readonly isLoading: boolean
}

export const IDLE_STATUS: SearchStatus = {
  text: '',
  matchCount: 0,
  connectionCount: 0,
  isLoading: false,
}

export function statusOf(text: string, found: FoundTables): SearchStatus {
  const { matchCount, connectionCount, isLoading } = found
  return { text, matchCount, connectionCount, isLoading }
}

function isSearching({ text }: SearchStatus): boolean {
  return text.trim() !== ''
}

// What shows inside the box, beside the text: how many tables and views match it.
export function matchBadge(status: SearchStatus): string {
  if (!isSearching(status) || status.connectionCount === 0) {
    return ''
  }
  return status.matchCount === 0 && !status.isLoading ? 'No results' : String(status.matchCount)
}

function matchesText(count: number): string {
  return count === 1 ? '1 table or view' : `${String(count)} tables and views`
}

// The line under the box: what to do, or why nothing shows.
export function statusLine(status: SearchStatus): string {
  if (status.connectionCount === 0) {
    return 'Connect to a connection to find its tables.'
  }
  if (!isSearching(status)) {
    return 'Type part of the name of a table or view.'
  }
  return status.isLoading ? loadingLine(status.matchCount) : foundLine(status.matchCount)
}

function loadingLine(count: number): string {
  return count === 0 ? 'Loading tables…' : `${matchesText(count)} so far, loading tables…`
}

function foundLine(count: number): string {
  return count === 0
    ? 'No table or view matches.'
    : `${matchesText(count)}: Enter opens the best match, ↓ goes to the tree.`
}

// The line the explorer shows when nothing found is there to show.
export function emptyFindText({ connectionCount, isLoading }: FoundTables): string {
  if (connectionCount === 0) {
    return 'Connect to a connection to find its tables'
  }
  return isLoading ? 'Loading tables…' : 'No table or view matches'
}
