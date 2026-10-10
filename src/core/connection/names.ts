const FIRST_SUFFIX = 2

// Connection names are compared without case and surrounding spaces.
export function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

export function nameKeys(names: Iterable<string>): ReadonlySet<string> {
  return new Set(Array.from(names, nameKey))
}

export function uniqueName(base: string, takenKeys: ReadonlySet<string>): string {
  const name = base.trim()
  let candidate = name
  let suffix = FIRST_SUFFIX
  while (takenKeys.has(nameKey(candidate))) {
    candidate = `${name} (${String(suffix)})`
    suffix += 1
  }
  return candidate
}
