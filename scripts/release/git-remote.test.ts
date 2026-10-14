import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { commitFiles, createRepository, git } from '../../test/support/git.ts'
import { gitRemote } from './git-remote.ts'

const MESSAGE = 'sqldoro 0.1.0'

async function head(repository: string): Promise<string> {
  return (await git(repository, 'rev-parse', 'HEAD')).trim()
}

// origin is a bare repository, as on GitHub, so that main can be pushed to it; `seed` stands for
// whoever else pushes to it, and `clone` is the shallow checkout of the release workflow.
describe('gitRemote', () => {
  let seed = ''
  let origin = ''
  let clone = ''
  let first = ''

  beforeEach(async () => {
    seed = await createRepository()
    await commitFiles(seed, new Map([['package.json', '{}']]), 'first')
    first = await head(seed)
    origin = await mkdtemp(join(tmpdir(), 'sqldoro-origin-'))
    await git(origin, 'init', '--quiet', '--bare', '--initial-branch=main')
    await git(seed, 'push', '--quiet', origin, 'main')
    clone = await mkdtemp(join(tmpdir(), 'sqldoro-clone-'))
    await git(clone, 'clone', '--quiet', '--depth', '1', `file://${origin}`, '.')
  })

  afterEach(async () => {
    for (const repository of [seed, origin, clone]) {
      await rm(repository, { recursive: true, force: true })
    }
  })

  async function commitRelease(): Promise<string> {
    await writeFile(join(clone, 'package.json'), '{"version":"0.1.0"}')
    return gitRemote(clone).commitAll('chore: release 0.1.0')
  }

  it('should give the commit of each branch and each tag of origin', async () => {
    await git(seed, 'tag', 'v0.0.1')
    await git(seed, 'tag', '--annotate', 'v0.0.2', '--message', 'sqldoro 0.0.2')
    await git(seed, 'push', '--quiet', origin, '--tags')
    const sut = gitRemote(clone)

    await expect(sut.branchCommits()).resolves.toStrictEqual(new Map([['main', first]]))
    await expect(sut.tagCommits()).resolves.toStrictEqual(
      new Map([
        ['v0.0.1', first],
        ['v0.0.2', first],
      ]),
    )
  })

  it('should list no tag when origin has none', async () => {
    await expect(gitRemote(clone).tagCommits()).resolves.toStrictEqual(new Map())
  })

  it('should commit the changed files only, and give the commit', async () => {
    await writeFile(join(clone, 'release-notes.md'), '- Notes.')

    const commit = await commitRelease()

    expect(commit).toBe(await head(clone))
    expect((await git(clone, 'log', '-1', '--format=%s')).trim()).toBe('chore: release 0.1.0')
    expect(await git(clone, 'show', '--name-only', '--format=', commit)).toBe('package.json\n')
  })

  it('should push the release commit to its branch, then fast-forward main to it', async () => {
    const commit = await commitRelease()
    const sut = gitRemote(clone)

    await sut.pushCommit(commit, 'release/v0.1.0')
    await expect(sut.branchCommits()).resolves.toStrictEqual(
      new Map([
        ['main', first],
        ['release/v0.1.0', commit],
      ]),
    )
    await sut.pushCommit(commit, 'main')
    await sut.deleteBranch('release/v0.1.0')

    await expect(sut.branchCommits()).resolves.toStrictEqual(new Map([['main', commit]]))
  })

  it('should refuse to push main when it moved', async () => {
    const commit = await commitRelease()
    await commitFiles(seed, new Map([['README.md', 'moved']]), 'meanwhile')
    await git(seed, 'push', '--quiet', origin, 'main')
    const moved = await head(seed)
    const sut = gitRemote(clone)

    await expect(sut.pushCommit(commit, 'main')).rejects.toThrow(/\[rejected\]/u)
    await expect(sut.branchCommits()).resolves.toStrictEqual(new Map([['main', moved]]))
  })

  it('should push an annotated tag on the commit to origin', async () => {
    const sut = gitRemote(clone)

    await sut.pushTag({ name: 'v0.1.0', message: MESSAGE, commit: first })

    expect((await git(origin, 'cat-file', '-t', 'v0.1.0')).trim()).toBe('tag')
    expect((await git(origin, 'tag', '--list', '--format=%(contents)', 'v0.1.0')).trim()).toBe(
      MESSAGE,
    )
    await expect(sut.tagCommits()).resolves.toStrictEqual(new Map([['v0.1.0', first]]))
  })

  it('should refuse to push a tag origin already has', async () => {
    await git(seed, 'tag', 'v0.1.0')
    await git(seed, 'push', '--quiet', origin, 'v0.1.0')
    const commit = await commitRelease()
    const sut = gitRemote(clone)

    await expect(sut.pushTag({ name: 'v0.1.0', message: MESSAGE, commit })).rejects.toThrow(
      /\(already exists\)/u,
    )
    await expect(sut.tagCommits()).resolves.toStrictEqual(new Map([['v0.1.0', first]]))
  })
})
