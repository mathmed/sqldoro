export const MAIN_BRANCH = 'main'
export const MAIN_REF = `refs/heads/${MAIN_BRANCH}`
const RELEASE_BRANCH_PREFIX = 'release/'

export const TagAction = {
  Create: 'create',
  Keep: 'keep',
  Conflict: 'conflict',
} as const

export type TagAction = (typeof TagAction)[keyof typeof TagAction]

export const MainAction = {
  Advance: 'advance',
  Keep: 'keep',
  Moved: 'moved',
} as const

export type MainAction = (typeof MainAction)[keyof typeof MainAction]

export interface Landing {
  readonly base: string
  readonly commit: string
}

// The release commit waits on a branch of its own until every gate has passed.
export function releaseBranchOf(tag: string): string {
  return `${RELEASE_BRANCH_PREFIX}${tag}`
}

export function isReleaseBranch(branch: string): boolean {
  return branch.startsWith(RELEASE_BRANCH_PREFIX) && branch.length > RELEASE_BRANCH_PREFIX.length
}

// A rerun finds the tag it pushed on the same commit and keeps it; a tag on any other commit is
// never moved.
export function tagAction(taggedCommit: string | undefined, commit: string): TagAction {
  if (taggedCommit === undefined) {
    return TagAction.Create
  }
  return taggedCommit === commit ? TagAction.Keep : TagAction.Conflict
}

// main only fast-forwards from the commit the release was prepared on (`base`, the parent of the
// release commit) to the release commit. A rerun finds main there already; anything else means
// main moved meanwhile, and it is left alone.
export function mainAction(mainCommit: string | undefined, { base, commit }: Landing): MainAction {
  if (mainCommit === commit) {
    return MainAction.Keep
  }
  return mainCommit === base ? MainAction.Advance : MainAction.Moved
}
