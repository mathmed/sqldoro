import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { commitFiles, createRepository, git } from '../../test/support/git.ts'
import { compareText } from '../shared/text.ts'
import { changedFiles } from './changed-files.ts'

describe('changedFiles', () => {
  let repository = ''

  beforeEach(async () => {
    repository = await createRepository()
    const base = new Map([
      ['kept.ts', 'a'],
      ['edited.ts', 'a'],
      ['deleted.ts', 'a'],
    ])
    await commitFiles(repository, base, 'base')
    await git(repository, 'switch', '--quiet', '--create', 'feature')
  })

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true })
  })

  it('should list the files added or modified since the base, never the deleted ones', async () => {
    await rm(join(repository, 'deleted.ts'))
    const feature = new Map([
      ['edited.ts', 'b'],
      ['added.ts', 'b'],
    ])
    await commitFiles(repository, feature, 'feature')

    const files = await changedFiles(repository, 'main')

    expect(files.toSorted(compareText)).toEqual(['added.ts', 'edited.ts'])
  })

  it('should list nothing when the branch has no changes', async () => {
    expect(await changedFiles(repository, 'main')).toEqual([])
  })
})
