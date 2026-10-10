// The quick search of the explorer: a case-insensitive part of the name, an empty filter matches all.
export function matchesFilter(name: string, filter: string): boolean {
  return name.toLowerCase().includes(filter.trim().toLowerCase())
}
