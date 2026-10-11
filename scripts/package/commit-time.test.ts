import { rm } from 'node:fs/promises'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { commitFiles, createRepository } from '../../test/support/git.ts'
import { lastCommitTime } from './commit-time.ts'

const COMMIT_TIME = 1_760_000_000

describe('lastCommitTime', () => {
  let repository = ''

  beforeEach(async () => {
    repository = await createRepository()
  })

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true })
  })

  it('should give the time of the last commit in seconds', async () => {
    vi.stubEnv('GIT_COMMITTER_DATE', `@${String(COMMIT_TIME)} +0000`)
    await commitFiles(repository, new Map([['a.txt', 'a']]), 'a')

    await expect(lastCommitTime(repository)).resolves.toBe(COMMIT_TIME)
  })

  it('should fail in a repository without commits', async () => {
    await expect(lastCommitTime(repository)).rejects.toThrow()
  })
})
