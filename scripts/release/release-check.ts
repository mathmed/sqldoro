import { findRelease, isReleaseDate, type Release } from './changelog.ts'
import { versionOf } from './version-tag.ts'

export interface ReleaseInputs {
  readonly tag: string
  readonly packageVersion: string
  readonly changelog: string
}

export type ReleaseCheck =
  | { readonly isReady: true; readonly version: string; readonly notes: string }
  | { readonly isReady: false; readonly problems: readonly string[] }

// A tag releases the version package.json holds, once CHANGELOG.md dates its section.
export function checkRelease({ tag, packageVersion, changelog }: ReleaseInputs): ReleaseCheck {
  const version = versionOf(tag)
  if (version === undefined) {
    return { isReady: false, problems: [`"${tag}" is not a version tag such as v1.2.3`] }
  }
  const release = findRelease(changelog, version)
  const problems = [
    ...packageProblems(tag, version, packageVersion),
    ...releaseProblems(version, release),
  ]
  return release !== undefined && problems.length === 0
    ? { isReady: true, version, notes: release.notes }
    : { isReady: false, problems }
}

function packageProblems(tag: string, version: string, packageVersion: string): string[] {
  return version === packageVersion
    ? []
    : [`the tag is ${tag} but package.json holds version ${packageVersion}`]
}

function releaseProblems(version: string, release: Release | undefined): string[] {
  if (release === undefined) {
    return [`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section`]
  }
  const section = `the CHANGELOG.md section of ${version}`
  return [
    ...(isReleaseDate(release.date)
      ? []
      : [`${section} is dated "${release.date}": give it the release date (YYYY-MM-DD)`]),
    ...(release.notes === '' ? [`${section} is empty`] : []),
  ]
}
