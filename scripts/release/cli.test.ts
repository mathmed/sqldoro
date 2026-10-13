import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { readText, writeText } from '../shared/files.ts'
import { main, type ReleaseContext } from './cli.ts'
import type { TagRepository } from './git-tags.ts'

const COMMIT = 'a'.repeat(40)
const OTHER_COMMIT = 'b'.repeat(40)
const USAGE = `usage:
  release check --tag <vX.Y.Z> [--notes <file>]   the tag matches package.json and CHANGELOG.md
  release plan --ref <git ref>                    whether a push releases, and with which tag
  release tag --tag <vX.Y.Z> --commit <sha>       tag that commit on origin, once`

// The tags of origin are the external boundary of the script: this fake stands in for git.
function tagRepository(tagCommits: ReadonlyMap<string, string> = new Map()): TagRepository {
  return {
    tagCommits: vi.fn(async () => Promise.resolve(tagCommits)),
    pushTag: vi.fn(async () => Promise.resolve()),
  }
}

describe('release command line', () => {
  let root = ''
  let output = ''
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  function context(
    tags: TagRepository = tagRepository(),
    environment: NodeJS.ProcessEnv = { GITHUB_OUTPUT: output },
  ): ReleaseContext {
    return { root, environment, tags }
  }

  async function writeVersion(version: string): Promise<void> {
    await writeText(join(root, 'package.json'), JSON.stringify({ name: 'sqldoro', version }))
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sqldoro-release-'))
    output = join(root, 'output')
    await writeVersion('0.1.0')
    await writeText(
      join(root, 'CHANGELOG.md'),
      '# Changelog\n\n## [0.1.0] - 2026-10-10\n\n- The first version.\n',
    )
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  describe('check', () => {
    it('should write the notes and give the version to the next steps', async () => {
      const notes = join(root, 'notes.md')

      const exitCode = await main(['check', '--tag', 'v0.1.0', '--notes', notes], context())

      expect(exitCode).toBe(0)
      expect(log).toHaveBeenCalledWith('Releasing sqldoro 0.1.0')
      expect(await readText(notes)).toBe('- The first version.\n')
      expect(await readText(output)).toBe('version=0.1.0\n')
    })

    it('should only check, without notes or GitHub Actions', async () => {
      const args = ['check', '--tag', 'v0.1.0']

      await expect(main(args, context(tagRepository(), { GITHUB_OUTPUT: '' }))).resolves.toBe(0)
      await expect(main(args, context(tagRepository(), {}))).resolves.toBe(0)
    })

    it('should fail and list the problems of a tag that cannot be released', async () => {
      const exitCode = await main(['check', '--tag', 'v0.2.0'], context())

      expect(exitCode).toBe(1)
      expect(error).toHaveBeenCalledWith(
        '✘ the tag is v0.2.0 but package.json holds version 0.1.0\n✘ CHANGELOG.md has no "## [0.2.0] - YYYY-MM-DD" section',
      )
    })
  })

  describe('plan', () => {
    it('should release and tag the version of package.json that has no tag', async () => {
      const tags = tagRepository(new Map([['v0.0.9', OTHER_COMMIT]]))

      await expect(main(['plan', '--ref', 'refs/heads/main'], context(tags))).resolves.toBe(0)

      expect(log).toHaveBeenCalledWith('v0.1.0 does not exist yet: releasing it, then tagging it')
      expect(await readText(output)).toBe(
        'tag=v0.1.0\nshould-release=true\nshould-create-tag=true\n',
      )
    })

    it('should do nothing for a version that is tagged already', async () => {
      const tags = tagRepository(new Map([['v0.1.0', COMMIT]]))

      await expect(main(['plan', '--ref', 'refs/heads/main'], context(tags))).resolves.toBe(0)

      expect(log).toHaveBeenCalledWith('v0.1.0 already exists: nothing to release')
      expect(await readText(output)).toBe(
        'tag=v0.1.0\nshould-release=false\nshould-create-tag=false\n',
      )
    })

    it('should release a pushed tag without tagging it again', async () => {
      const tags = tagRepository(new Map([['v0.1.0', COMMIT]]))

      await expect(main(['plan', '--ref', 'refs/tags/v0.1.0'], context(tags))).resolves.toBe(0)

      expect(log).toHaveBeenCalledWith('Releasing the pushed tag v0.1.0')
      expect(await readText(output)).toBe(
        'tag=v0.1.0\nshould-release=true\nshould-create-tag=false\n',
      )
    })

    it('should refuse an output that would span several lines', async () => {
      await writeVersion('0.1.0\nshould-release=false')

      await expect(main(['plan', '--ref', 'refs/heads/main'], context())).rejects.toThrow(
        'the output "tag" would span several lines',
      )
      await expect(readText(output)).rejects.toThrow()
    })

    it('should refuse to plan without the pushed ref', async () => {
      await expect(main(['plan'], context())).resolves.toBe(2)
      expect(error).toHaveBeenCalledWith(`plan needs the --ref that was pushed\n${USAGE}`)
    })
  })

  describe('tag', () => {
    it('should push the annotated tag of the version on the commit', async () => {
      const tags = tagRepository(new Map([['v0.0.9', OTHER_COMMIT]]))

      const exitCode = await main(['tag', '--tag', 'v0.1.0', '--commit', COMMIT], context(tags))

      expect(exitCode).toBe(0)
      expect(tags.pushTag).toHaveBeenCalledExactlyOnceWith({
        name: 'v0.1.0',
        message: 'sqldoro 0.1.0',
        commit: COMMIT,
      })
      expect(log).toHaveBeenCalledWith(`Tagged ${COMMIT} as v0.1.0`)
    })

    it('should keep the tag a previous attempt pushed on the same commit', async () => {
      const tags = tagRepository(new Map([['v0.1.0', COMMIT]]))

      const exitCode = await main(['tag', '--tag', 'v0.1.0', '--commit', COMMIT], context(tags))

      expect(exitCode).toBe(0)
      expect(tags.pushTag).not.toHaveBeenCalled()
      expect(log).toHaveBeenCalledWith(`v0.1.0 already tags ${COMMIT}: kept as it is`)
    })

    it('should fail without moving a tag that is on another commit', async () => {
      const tags = tagRepository(new Map([['v0.1.0', OTHER_COMMIT]]))

      const exitCode = await main(['tag', '--tag', 'v0.1.0', '--commit', COMMIT], context(tags))

      expect(exitCode).toBe(1)
      expect(tags.pushTag).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(
        `✘ v0.1.0 already tags ${OTHER_COMMIT}, not ${COMMIT}: it is not moved`,
      )
    })

    it('should take the full hash of a SHA-256 repository', async () => {
      const commit = 'c'.repeat(64)
      const tags = tagRepository()

      await expect(
        main(['tag', '--tag', 'v0.1.0', '--commit', commit], context(tags)),
      ).resolves.toBe(0)
      expect(tags.pushTag).toHaveBeenCalledOnce()
    })

    it.each([
      { arguments: 'no tag', args: ['--commit', COMMIT] },
      { arguments: 'a tag that is not a version', args: ['--tag', 'latest', '--commit', COMMIT] },
      { arguments: 'no commit', args: ['--tag', 'v0.1.0'] },
      { arguments: 'a short commit', args: ['--tag', 'v0.1.0', '--commit', COMMIT.slice(0, 7)] },
      { arguments: 'a longer commit', args: ['--tag', 'v0.1.0', '--commit', `${COMMIT}0`] },
      {
        arguments: 'an uppercase commit',
        args: ['--tag', 'v0.1.0', '--commit', COMMIT.toUpperCase()],
      },
    ])('should refuse $arguments', async ({ args }) => {
      const tags = tagRepository()

      await expect(main(['tag', ...args], context(tags))).resolves.toBe(2)
      expect(tags.pushTag).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(
        `tag needs a version --tag and the full hash of the --commit\n${USAGE}`,
      )
    })
  })

  it('should refuse an unknown command', async () => {
    await expect(main(['publish'], context())).resolves.toBe(2)
    expect(error).toHaveBeenCalledWith(`unknown command "publish"\n${USAGE}`)
  })
})
