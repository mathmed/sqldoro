import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { commitFiles, createRepository, git } from '../../test/support/git.ts'
import { gitTags } from './git-tags.ts'

describe('gitTags', () => {
  let origin = ''
  let clone = ''
  let commit = ''

  beforeEach(async () => {
    origin = await createRepository()
    await commitFiles(origin, new Map([['package.json', '{}']]), 'first')
    commit = (await git(origin, 'rev-parse', 'HEAD')).trim()
    clone = await mkdtemp(join(tmpdir(), 'sqldoro-clone-'))
    await git(clone, 'clone', '--quiet', origin, '.')
  })

  afterEach(async () => {
    await rm(origin, { recursive: true, force: true })
    await rm(clone, { recursive: true, force: true })
  })

  it('should list no tag when origin has none', async () => {
    await expect(gitTags(clone).tagCommits()).resolves.toStrictEqual(new Map())
  })

  it('should give the commit of each tag of origin, annotated or not', async () => {
    await git(origin, 'tag', 'v0.0.1')
    await git(origin, 'tag', '--annotate', 'v0.0.2', '--message', 'sqldoro 0.0.2')

    await expect(gitTags(clone).tagCommits()).resolves.toStrictEqual(
      new Map([
        ['v0.0.1', commit],
        ['v0.0.2', commit],
      ]),
    )
  })

  it('should push an annotated tag on the commit to origin', async () => {
    const sut = gitTags(clone)

    await sut.pushTag({ name: 'v0.1.0', message: 'sqldoro 0.1.0', commit })

    expect((await git(origin, 'cat-file', '-t', 'v0.1.0')).trim()).toBe('tag')
    expect((await git(origin, 'tag', '--list', '--format=%(contents)', 'v0.1.0')).trim()).toBe(
      'sqldoro 0.1.0',
    )
    await expect(sut.tagCommits()).resolves.toStrictEqual(new Map([['v0.1.0', commit]]))
  })

  it('should refuse to push a tag origin already has', async () => {
    await git(origin, 'tag', 'v0.1.0')
    await commitFiles(origin, new Map([['package.json', '{"version":"0.1.0"}']]), 'second')
    await git(clone, 'pull', '--quiet', '--no-tags')
    const head = (await git(clone, 'rev-parse', 'HEAD')).trim()

    await expect(
      gitTags(clone).pushTag({ name: 'v0.1.0', message: 'sqldoro 0.1.0', commit: head }),
    ).rejects.toThrow(/\(already exists\)/u)
    await expect(gitTags(clone).tagCommits()).resolves.toStrictEqual(new Map([['v0.1.0', commit]]))
  })
})
