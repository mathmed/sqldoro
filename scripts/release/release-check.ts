import { findRelease, isReleaseDate, type Release } from './changelog.ts'

// v1.2.3 or v1.2.3-rc.1: the tags that start a release.
const TAG_PREFIX = 'v'
const PRE_RELEASE_SEPARATOR = '-'
const CORE_VERSION = /^\d+\.\d+\.\d+$/u
const PRE_RELEASE = /^[0-9A-Za-z.-]+$/u

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

// The version a tag names: v1.2.3 is 1.2.3, v1.2.3-rc.1 is 1.2.3-rc.1.
function versionOf(tag: string): string | undefined {
  const version = tag.slice(TAG_PREFIX.length)
  return tag.startsWith(TAG_PREFIX) && isVersion(version) ? version : undefined
}

function isVersion(version: string): boolean {
  const [core = '', ...preRelease] = version.split(PRE_RELEASE_SEPARATOR)
  const label = preRelease.join(PRE_RELEASE_SEPARATOR)
  return CORE_VERSION.test(core) && (preRelease.length === 0 || PRE_RELEASE.test(label))
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
