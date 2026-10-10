import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { compareText } from '../shared/text.ts'
import { changedFiles } from './changed-files.ts'

const git = promisify(execFile)

describe('changedFiles', () => {
  let repository = ''

  async function commit(files: Record<string, string>, message: string): Promise<void> {
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(repository, name), content)
    }
    await git('git', ['add', '--all'], { cwd: repository })
    await git('git', ['commit', '--quiet', '--message', message], { cwd: repository })
  }

  beforeEach(async () => {
    repository = await mkdtemp(join(tmpdir(), 'sqldoro-git-'))
    await git('git', ['init', '--quiet', '--initial-branch=main'], { cwd: repository })
    await git('git', ['config', 'user.email', 'test@example.com'], { cwd: repository })
    await git('git', ['config', 'user.name', 'Test'], { cwd: repository })
    await commit({ 'kept.ts': 'a', 'edited.ts': 'a', 'deleted.ts': 'a' }, 'base')
    await git('git', ['switch', '--quiet', '--create', 'feature'], { cwd: repository })
  })

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true })
  })

  it('should list the files added or modified since the base, never the deleted ones', async () => {
    await rm(join(repository, 'deleted.ts'))
    await commit({ 'edited.ts': 'b', 'added.ts': 'b' }, 'feature')

    const files = await changedFiles(repository, 'main')

    expect(files.toSorted(compareText)).toEqual(['added.ts', 'edited.ts'])
  })

  it('should list nothing when the branch has no changes', async () => {
    expect(await changedFiles(repository, 'main')).toEqual([])
  })
})
