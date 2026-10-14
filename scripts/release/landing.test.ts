import { describe, expect, it } from 'vitest'

import {
  isReleaseBranch,
  MainAction,
  mainAction,
  releaseBranchOf,
  TagAction,
  tagAction,
} from './landing.ts'

const BASE = 'a'.repeat(40)
const COMMIT = 'b'.repeat(40)
const OTHER_COMMIT = 'c'.repeat(40)

describe('releaseBranchOf', () => {
  it('should name the branch of the release commit after its tag', () => {
    expect(releaseBranchOf('v0.1.3')).toBe('release/v0.1.3')
  })
})

describe('isReleaseBranch', () => {
  it('should only take the branches of release commits', () => {
    expect(isReleaseBranch('release/v0.1.3')).toBe(true)
    expect(isReleaseBranch('main')).toBe(false)
    expect(isReleaseBranch('release/')).toBe(false)
    expect(isReleaseBranch('feature/release/v0.1.3')).toBe(false)
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

describe('mainAction', () => {
  it('should fast-forward main from the commit the release was prepared on', () => {
    expect(mainAction(BASE, { base: BASE, commit: COMMIT })).toBe(MainAction.Advance)
  })

  it('should keep main when it is at the release commit already', () => {
    expect(mainAction(COMMIT, { base: BASE, commit: COMMIT })).toBe(MainAction.Keep)
  })

  it('should leave main alone when it moved meanwhile', () => {
    expect(mainAction(OTHER_COMMIT, { base: BASE, commit: COMMIT })).toBe(MainAction.Moved)
    expect(mainAction(undefined, { base: BASE, commit: COMMIT })).toBe(MainAction.Moved)
  })
})
