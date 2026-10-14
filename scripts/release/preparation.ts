import { releaseUnreleased } from './changelog.ts'
import { MAIN_REF, releaseBranchOf } from './landing.ts'
import { type Bump, nextVersion } from './next-version.ts'
import { tagOf } from './version-tag.ts'

export interface PreparationInputs {
  readonly ref: string
  readonly bump: Bump
  readonly requestedVersion: string
  readonly packageVersion: string
  readonly tagCommits: ReadonlyMap<string, string>
  readonly changelog: string
  readonly date: string
}

export type Preparation =
  | {
      readonly isReady: true
      readonly version: string
      readonly tag: string
      readonly branch: string
      readonly changelog: string
    }
  | { readonly isReady: false; readonly problems: readonly string[] }

// The next release, from main only: its version (never one that is tagged already) and the
// CHANGELOG.md that dates what [Unreleased] lists.
export function prepareRelease(inputs: PreparationInputs): Preparation {
  if (inputs.ref !== MAIN_REF) {
    return refused(`a release starts from main, not from ${inputs.ref}`)
  }
  const choice = nextVersion(inputs.packageVersion, inputs.bump, inputs.requestedVersion)
  if (!choice.isValid) {
    return refused(choice.problem)
  }
  const { version } = choice
  const tag = tagOf(version)
  if (inputs.tagCommits.has(tag)) {
    return refused(`${tag} already exists`)
  }
  const edit = releaseUnreleased(inputs.changelog, { version, tag, date: inputs.date })
  return edit.isReady
    ? { isReady: true, version, tag, branch: releaseBranchOf(tag), changelog: edit.changelog }
    : edit
}

function refused(problem: string): Preparation {
  return { isReady: false, problems: [problem] }
}
