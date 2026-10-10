import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { lastCommitTime } from './commit-time.ts'

const git = promisify(execFile)
const COMMIT_TIME = 1_760_000_000

describe('lastCommitTime', () => {
  let repository = ''

  beforeEach(async () => {
    repository = await mkdtemp(join(tmpdir(), 'sqldoro-git-'))
    await git('git', ['init', '--quiet', '--initial-branch=main'], { cwd: repository })
  })

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true })
  })

  it('should give the time of the last commit in seconds', async () => {
    await writeFile(join(repository, 'a.txt'), 'a')
    await git('git', ['add', '--all'], { cwd: repository })
    await git(
      'git',
      ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '--quiet', '-m', 'a'],
      {
        cwd: repository,
        env: { ...process.env, GIT_COMMITTER_DATE: `@${String(COMMIT_TIME)} +0000` },
      },
    )

    await expect(lastCommitTime(repository)).resolves.toBe(COMMIT_TIME)
  })

  it('should fail in a repository without commits', async () => {
    await expect(lastCommitTime(repository)).rejects.toThrow()
  })
})
