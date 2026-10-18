import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { commitFiles, createRepository, git } from '../../test/support/git.ts'
import { changedFiles, touchedFiles, workingTreeFiles } from './git-files.ts'
import { compareText } from './text.ts'

describe('git files', () => {
  let repository = ''

  beforeEach(async () => {
    repository = await createRepository()
    const base = new Map([
      ['kept.ts', 'a'],
      ['edited.ts', 'a'],
      ['deleted.ts', 'a'],
      ['moved.ts', 'a'],
    ])
    await commitFiles(repository, base, 'base')
    await git(repository, 'switch', '--quiet', '--create', 'feature')
  })

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true })
  })

  async function changeTheBranch(): Promise<void> {
    await rm(join(repository, 'deleted.ts'))
    await git(repository, 'mv', 'moved.ts', 'renamed.ts')
    const feature = new Map([
      ['edited.ts', 'b'],
      ['added café.ts', 'b'],
    ])
    await commitFiles(repository, feature, 'feature')
  }

  describe('changedFiles', () => {
    it('should list the files added or modified since the base, never the deleted ones', async () => {
      await changeTheBranch()

      const sut = await changedFiles(repository, 'main')

      expect(sut.toSorted(compareText)).toEqual(['added café.ts', 'edited.ts', 'renamed.ts'])
    })

    it('should list nothing when the branch has no changes', async () => {
      expect(await changedFiles(repository, 'main')).toEqual([])
    })
  })

  describe('touchedFiles', () => {
    it('should list every path the branch adds, changes, deletes or renames, both sides of a rename', async () => {
      await changeTheBranch()

      const sut = await touchedFiles(repository, 'main')

      expect(sut.toSorted(compareText)).toEqual([
        'added café.ts',
        'deleted.ts',
        'edited.ts',
        'moved.ts',
        'renamed.ts',
      ])
    })

    it('should fail when the base does not exist', async () => {
      await expect(touchedFiles(repository, 'origin/missing')).rejects.toThrow('origin/missing')
    })
  })

  describe('workingTreeFiles', () => {
    it('should list tracked and untracked files, but neither ignored nor deleted ones', async () => {
      await writeFile(join(repository, '.gitignore'), 'ignored/\n')
      await mkdir(join(repository, 'ignored'))
      await writeFile(join(repository, 'ignored', 'out.ts'), 'a')
      await writeFile(join(repository, 'new.ts'), 'a')
      await rm(join(repository, 'deleted.ts'))

      const sut = await workingTreeFiles(repository)

      expect(sut.toSorted(compareText)).toEqual([
        '.gitignore',
        'edited.ts',
        'kept.ts',
        'moved.ts',
        'new.ts',
      ])
    })
  })
})
