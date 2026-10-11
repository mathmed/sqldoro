import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { changedFiles } from '../../scripts/mutation/changed-files.ts'
import { lastCommitTime } from '../../scripts/package/commit-time.ts'
import { commitFiles, createRepository, git } from './git.ts'

interface RepositoryState {
  readonly config: string
  readonly head: string
  readonly refs: string
  readonly index: string
}

async function stateOf(repository: string): Promise<RepositoryState> {
  return {
    config: await readFile(join(repository, '.git', 'config'), 'utf8'),
    head: await readFile(join(repository, '.git', 'HEAD'), 'utf8'),
    refs: await git(repository, 'for-each-ref', '--format=%(refname) %(objectname)'),
    index: await git(repository, 'ls-files', '--stage'),
  }
}

// What a git hook exports to the commands it runs, here aimed at a scratch repository.
function inheritHookEnvironment(victim: string): void {
  vi.stubEnv('GIT_DIR', join(victim, '.git'))
  vi.stubEnv('GIT_INDEX_FILE', join(victim, '.git', 'index'))
  vi.stubEnv('GIT_WORK_TREE', victim)
}

describe('createRepository', () => {
  const directories: string[] = []
  let victim = ''

  beforeEach(async () => {
    victim = await createRepository()
    directories.push(victim)
    await commitFiles(victim, new Map([['victim.txt', 'v']]), 'victim')
  })

  afterEach(async () => {
    await Promise.all(directories.splice(0).map(async (path) => rm(path, { recursive: true })))
  })

  it('should let git reach the victim when the hook environment is inherited', async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), 'sqldoro-elsewhere-'))
    directories.push(elsewhere)
    inheritHookEnvironment(victim)

    const gitDirectory = await git(elsewhere, 'rev-parse', '--absolute-git-dir')

    expect(gitDirectory.trim()).toBe(await realpath(join(victim, '.git')))
  })

  it('should keep the repository of a git hook untouched by the tests', async () => {
    const before = await stateOf(victim)
    inheritHookEnvironment(victim)

    const sut = await createRepository()
    directories.push(sut)
    await commitFiles(sut, new Map([['base.ts', 'a']]), 'base')
    await git(sut, 'switch', '--quiet', '--create', 'feature')
    await commitFiles(sut, new Map([['added.ts', 'b']]), 'feature')

    expect(await changedFiles(sut, 'main')).toEqual(['added.ts'])
    expect(await lastCommitTime(sut)).toBeGreaterThan(0)
    expect(await stateOf(victim)).toEqual(before)
  })
})
