import { TAG_REF_PREFIX, tagOf } from './version-tag.ts'

export interface PlanInputs {
  readonly ref: string
  readonly packageVersion: string
  readonly tagCommits: ReadonlyMap<string, string>
}

export interface ReleasePlan {
  readonly tag: string
  readonly shouldRelease: boolean
  readonly shouldCreateTag: boolean
}

export const TagAction = {
  Create: 'create',
  Keep: 'keep',
  Conflict: 'conflict',
} as const

export type TagAction = (typeof TagAction)[keyof typeof TagAction]

// A version tag pushed by hand releases itself. A push to main releases the version package.json
// holds while that version has no tag yet, and then tags it: every later push finds the tag.
export function planRelease({ ref, packageVersion, tagCommits }: PlanInputs): ReleasePlan {
  if (ref.startsWith(TAG_REF_PREFIX)) {
    return { tag: ref.slice(TAG_REF_PREFIX.length), shouldRelease: true, shouldCreateTag: false }
  }
  const tag = tagOf(packageVersion)
  const isUntagged = !tagCommits.has(tag)
  return { tag, shouldRelease: isUntagged, shouldCreateTag: isUntagged }
}

// A rerun finds the tag it pushed on the same commit and keeps it; a tag on any other commit is
// never moved.
export function tagAction(taggedCommit: string | undefined, commit: string): TagAction {
  if (taggedCommit === undefined) {
    return TagAction.Create
  }
  return taggedCommit === commit ? TagAction.Keep : TagAction.Conflict
}
