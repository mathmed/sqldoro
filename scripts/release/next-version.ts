const PRE_RELEASE_SEPARATOR = '-'
const PART_SEPARATOR = '.'
const CORE_VERSION = /^\d+\.\d+\.\d+$/u

export const Bump = {
  Patch: 'patch',
  Minor: 'minor',
  Major: 'major',
} as const

export type Bump = (typeof Bump)[keyof typeof Bump]

const BUMPS: ReadonlySet<string> = new Set(Object.values(Bump))

type Core = readonly [number, number, number]

export type VersionChoice =
  | { readonly isValid: true; readonly version: string }
  | { readonly isValid: false; readonly problem: string }

export function isBump(value: string): value is Bump {
  return BUMPS.has(value)
}

// The version to release after `current`: the exact one asked for (X.Y.Z, after the current one),
// or else the current one with one part raised.
export function nextVersion(current: string, bump: Bump, requested: string): VersionChoice {
  if (requested !== '') {
    return requestedVersion(current, requested)
  }
  if (!CORE_VERSION.test(current)) {
    return refused(`package.json holds ${current}: give the exact version to release`)
  }
  return { isValid: true, version: raise(coreOf(current), bump).join(PART_SEPARATOR) }
}

function requestedVersion(current: string, requested: string): VersionChoice {
  if (!CORE_VERSION.test(requested)) {
    return refused(`"${requested}" is not a version such as 1.2.3`)
  }
  return isAfter(requested, current)
    ? { isValid: true, version: requested }
    : refused(`${requested} does not come after ${current}, the version of package.json`)
}

function raise([major, minor, patch]: Core, bump: Bump): Core {
  switch (bump) {
    case Bump.Patch:
      return [major, minor, patch + 1]
    case Bump.Minor:
      return [major, minor + 1, 0]
    case Bump.Major:
      return [major + 1, 0, 0]
  }
}

// 1.0.0 comes after 0.9.9 and after its own pre-releases (1.0.0-rc.1).
function isAfter(requested: string, current: string): boolean {
  const [core = '', ...preRelease] = current.split(PRE_RELEASE_SEPARATOR)
  const order = compareCores(coreOf(requested), coreOf(core))
  return order > 0 || (order === 0 && preRelease.length > 0)
}

function compareCores([major, minor, patch]: Core, other: Core): number {
  const differences = [major - other[0], minor - other[1], patch - other[2]]
  return differences.find((difference) => difference !== 0) ?? 0
}

function coreOf(version: string): Core {
  const [major = 0, minor = 0, patch = 0] = version.split(PART_SEPARATOR).map(Number)
  return [major, minor, patch]
}

function refused(problem: string): VersionChoice {
  return { isValid: false, problem }
}
