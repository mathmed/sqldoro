import { describe, expect, it } from 'vitest'

import { tagOf, versionOf } from './version-tag.ts'

describe('tagOf', () => {
  it('should prefix the version with v', () => {
    expect(tagOf('1.2.3')).toBe('v1.2.3')
  })
})

describe('versionOf', () => {
  it('should give the version a release tag names', () => {
    expect(versionOf('v1.2.3')).toBe('1.2.3')
    expect(versionOf('v1.0.0-rc.1')).toBe('1.0.0-rc.1')
  })

  it('should refuse what is not a version tag', () => {
    expect(versionOf('1.2.3')).toBeUndefined()
    expect(versionOf('release-1')).toBeUndefined()
    expect(versionOf('v1.2')).toBeUndefined()
    expect(versionOf('v1.2.3.4')).toBeUndefined()
    expect(versionOf('v1.2.3-')).toBeUndefined()
    expect(versionOf('v1.2.3-rc_1')).toBeUndefined()
    expect(versionOf('xv1.2.3')).toBeUndefined()
  })
})
