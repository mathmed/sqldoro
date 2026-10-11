// The quick search of the explorer: a case-insensitive part of the name, an empty filter matches all.
export function matchesFilter(name: string, filter: string): boolean {
  return name.toLowerCase().includes(filter.trim().toLowerCase())
}

// Where the filter is in the name, to highlight it: the start and the end (excluded) of its first
// match, whatever its case; none when the name does not hold it, or the filter is empty.
export function filterHighlights(name: string, filter: string): [start: number, end: number][] {
  const needle = filter.trim().toLowerCase()
  const start = needle === '' ? -1 : name.toLowerCase().indexOf(needle)
  return start === -1 ? [] : [[start, start + needle.length]]
}
