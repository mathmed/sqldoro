import type { FoundTables } from './found.ts'

// Where finding a table stands, for the box of Find Table in Explorer: the text as typed and what it
// found.
export interface SearchStatus {
  readonly text: string
  readonly matchCount: number
  readonly connectionCount: number
  readonly isLoading: boolean
}

export function statusOf(text: string, found: FoundTables): SearchStatus {
  const { matchCount, connectionCount, isLoading } = found
  return { text, matchCount, connectionCount, isLoading }
}

function isSearching({ text }: SearchStatus): boolean {
  return text.trim() !== ''
}

function matchesText(count: number): string {
  return count === 1 ? '1 table or view matches' : `${String(count)} tables and views match`
}

// The line under the box: how many tables and views match and what the keys do, or why none shows.
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
    : `${matchesText(count)} · Enter opens the best match · Escape restores the tree`
}

// The line the explorer shows when nothing found is there to show.
export function emptyFindText({ connectionCount, isLoading }: FoundTables): string {
  if (connectionCount === 0) {
    return 'Connect to a connection to find its tables'
  }
  return isLoading ? 'Loading tables…' : 'No table or view matches'
}
