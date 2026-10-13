import { describe, expect, it } from 'vitest'

import { planRelease, TagAction, tagAction } from './plan.ts'

const COMMIT = 'a'.repeat(40)
const OTHER_COMMIT = 'b'.repeat(40)
const TAGGED: ReadonlyMap<string, string> = new Map([['v0.1.2', OTHER_COMMIT]])

describe('planRelease', () => {
  it('should release and tag the version of package.json that has no tag yet', () => {
    expect(
      planRelease({ ref: 'refs/heads/main', packageVersion: '0.1.3', tagCommits: TAGGED }),
    ).toStrictEqual({ tag: 'v0.1.3', shouldRelease: true, shouldCreateTag: true })
  })

  it('should do nothing when the version of package.json is tagged already', () => {
    expect(
      planRelease({ ref: 'refs/heads/main', packageVersion: '0.1.2', tagCommits: TAGGED }),
    ).toStrictEqual({ tag: 'v0.1.2', shouldRelease: false, shouldCreateTag: false })
  })

  it('should release a pushed tag without tagging again', () => {
    expect(
      planRelease({ ref: 'refs/tags/v0.1.2', packageVersion: '0.1.2', tagCommits: TAGGED }),
    ).toStrictEqual({ tag: 'v0.1.2', shouldRelease: true, shouldCreateTag: false })
  })
})

describe('tagAction', () => {
  it('should create a tag that does not exist', () => {
    expect(tagAction(undefined, COMMIT)).toBe(TagAction.Create)
  })

  it('should keep a tag already on the commit', () => {
    expect(tagAction(COMMIT, COMMIT)).toBe(TagAction.Keep)
  })

  it('should never move a tag on another commit', () => {
    expect(tagAction(OTHER_COMMIT, COMMIT)).toBe(TagAction.Conflict)
  })
})
