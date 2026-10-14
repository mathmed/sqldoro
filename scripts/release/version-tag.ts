// v1.2.3 or v1.2.3-rc.1: the tags that start a release.
const TAG_PREFIX = 'v'
export const TAG_REF_PREFIX = 'refs/tags/'
const PRE_RELEASE_SEPARATOR = '-'
const CORE_VERSION = /^\d+\.\d+\.\d+$/u
const PRE_RELEASE = /^[0-9A-Za-z.-]+$/u

export function tagOf(version: string): string {
  return `${TAG_PREFIX}${version}`
}

// The version a tag names: v1.2.3 is 1.2.3, v1.2.3-rc.1 is 1.2.3-rc.1.
export function versionOf(tag: string): string | undefined {
  const version = tag.slice(TAG_PREFIX.length)
  return tag.startsWith(TAG_PREFIX) && isVersion(version) ? version : undefined
}

function isVersion(version: string): boolean {
  const [core = '', ...preRelease] = version.split(PRE_RELEASE_SEPARATOR)
  const label = preRelease.join(PRE_RELEASE_SEPARATOR)
  return CORE_VERSION.test(core) && (preRelease.length === 0 || PRE_RELEASE.test(label))
}
