import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { readText, writeText } from '../shared/files.ts'
import { main, type ReleaseContext } from './cli.ts'
import type { ReleaseRemote } from './git-remote.ts'

const BASE = 'a'.repeat(40)
const COMMIT = 'b'.repeat(40)
const OTHER_COMMIT = 'c'.repeat(40)
// 23:30 in São Paulo is already the next day in UTC: the release is dated in UTC.
const NOW = new Date('2026-10-14T23:30:00-03:00')
const CHANGELOG = `# Changelog

## [Unreleased]

- Something new.

## [0.1.0] - 2026-10-10

- The first version.

[Unreleased]: https://github.com/mathmed/sqldoro/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mathmed/sqldoro/releases/tag/v0.1.0
`
const LAND = ['land', '--tag', 'v0.1.1', '--commit', COMMIT, '--base', BASE]

interface RemoteState {
  readonly branches?: ReadonlyMap<string, string>
  readonly tags?: ReadonlyMap<string, string>
  readonly commit?: string
}

// origin is the external boundary of the script: this fake stands in for git.
function fakeRemote({
  branches = new Map(),
  tags = new Map(),
  commit = COMMIT,
}: RemoteState = {}): ReleaseRemote {
  return {
    branchCommits: vi.fn(async () => Promise.resolve(branches)),
    tagCommits: vi.fn(async () => Promise.resolve(tags)),
    commitAll: vi.fn(async () => Promise.resolve(commit)),
    pushCommit: vi.fn(async () => Promise.resolve()),
    pushTag: vi.fn(async () => Promise.resolve()),
    deleteBranch: vi.fn(async () => Promise.resolve()),
  }
}

describe('release command line', () => {
  let root = ''
  let output = ''
  let summary = ''
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  function context(
    remote: ReleaseRemote = fakeRemote(),
    environment: NodeJS.ProcessEnv = { GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
  ): ReleaseContext {
    return { root, environment, remote, now: () => NOW }
  }

  async function writeVersion(version: string): Promise<void> {
    await writeText(join(root, 'package.json'), JSON.stringify({ name: 'sqldoro', version }))
  }

  function expectNothingPushed(remote: ReleaseRemote): void {
    expect(remote.pushCommit).not.toHaveBeenCalled()
    expect(remote.pushTag).not.toHaveBeenCalled()
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sqldoro-release-'))
    output = join(root, 'output')
    summary = join(root, 'summary.md')
    await writeVersion('0.1.0')
    await writeText(join(root, 'CHANGELOG.md'), CHANGELOG)
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  describe('prepare', () => {
    const PREPARE = ['prepare', '--ref', 'refs/heads/main', '--bump', 'patch']

    it('should date the next version in CHANGELOG.md and give it to the next steps', async () => {
      await expect(main(PREPARE, context())).resolves.toBe(0)

      expect(await readText(join(root, 'CHANGELOG.md'))).toContain(
        '## [Unreleased]\n\n## [0.1.1] - 2026-10-15\n\n- Something new.',
      )
      expect(log).toHaveBeenCalledWith('Preparing sqldoro 0.1.1 on release/v0.1.1')
      expect(await readText(output)).toBe('version=0.1.1\ntag=v0.1.1\nbranch=release/v0.1.1\n')
    })

    it('should take the exact version asked for', async () => {
      await expect(main([...PREPARE, '--version', '0.2.0'], context())).resolves.toBe(0)

      expect(await readText(output)).toContain('version=0.2.0\n')
    })

    it('should change nothing when the version cannot be released', async () => {
      const remote = fakeRemote({ tags: new Map([['v0.1.1', OTHER_COMMIT]]) })

      await expect(main(PREPARE, context(remote))).resolves.toBe(1)

      expect(error).toHaveBeenCalledWith('✘ v0.1.1 already exists')
      expect(await readText(join(root, 'CHANGELOG.md'))).toBe(CHANGELOG)
      await expect(readText(output)).rejects.toThrow()
    })

    it('should refuse a bump it does not know', async () => {
      await expect(main(['prepare', '--bump', 'build'], context())).resolves.toBe(2)
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/^"build" is not a --bump\nusage:/u))
    })
  })

  describe('check', () => {
    beforeEach(async () => {
      await writeText(
        join(root, 'CHANGELOG.md'),
        '# Changelog\n\n## [0.1.0] - 2026-10-10\n\n- The first version.\n',
      )
    })

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

      await expect(main(args, context(fakeRemote(), { GITHUB_OUTPUT: '' }))).resolves.toBe(0)
      await expect(main(args, context(fakeRemote(), {}))).resolves.toBe(0)
    })

    it('should fail and list the problems of a tag that cannot be released', async () => {
      const exitCode = await main(['check', '--tag', 'v0.2.0'], context())

      expect(exitCode).toBe(1)
      expect(error).toHaveBeenCalledWith(
        '✘ the tag is v0.2.0 but package.json holds version 0.1.0\n✘ CHANGELOG.md has no "## [0.2.0] - YYYY-MM-DD" section',
      )
    })
  })

  describe('commit', () => {
    it('should commit the release and push it to its branch only', async () => {
      const remote = fakeRemote()

      await expect(main(['commit', '--tag', 'v0.1.1'], context(remote))).resolves.toBe(0)

      expect(remote.commitAll).toHaveBeenCalledExactlyOnceWith('chore: release 0.1.1')
      expect(remote.pushCommit).toHaveBeenCalledExactlyOnceWith(COMMIT, 'release/v0.1.1')
      expect(log).toHaveBeenCalledWith(`Committed sqldoro 0.1.1 as ${COMMIT} on release/v0.1.1`)
      expect(await readText(output)).toBe(`commit=${COMMIT}\n`)
    })

    it('should refuse an output that would span several lines', async () => {
      const remote = fakeRemote({ commit: `${COMMIT}\nbranch=main` })

      await expect(main(['commit', '--tag', 'v0.1.1'], context(remote))).rejects.toThrow(
        'the output "commit" would span several lines',
      )
    })

    it('should refuse a tag that is not a version', async () => {
      const remote = fakeRemote()

      await expect(main(['commit', '--tag', 'latest'], context(remote))).resolves.toBe(2)
      expect(remote.commitAll).not.toHaveBeenCalled()
    })
  })

  describe('land', () => {
    it('should fast-forward main to the release commit, then tag it', async () => {
      const remote = fakeRemote({ branches: new Map([['main', BASE]]) })

      await expect(main(LAND, context(remote))).resolves.toBe(0)

      expect(remote.pushCommit).toHaveBeenCalledExactlyOnceWith(COMMIT, 'main')
      expect(remote.pushTag).toHaveBeenCalledExactlyOnceWith({
        name: 'v0.1.1',
        message: 'sqldoro 0.1.1',
        commit: COMMIT,
      })
      expect(vi.mocked(remote.pushCommit).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(remote.pushTag).mock.invocationCallOrder[0] ?? 0,
      )
      expect(log).toHaveBeenCalledWith(`main fast-forwarded to ${COMMIT}`)
      expect(log).toHaveBeenCalledWith(`Tagged ${COMMIT} as v0.1.1`)
    })

    it('should keep what a previous attempt landed', async () => {
      const remote = fakeRemote({
        branches: new Map([['main', COMMIT]]),
        tags: new Map([['v0.1.1', COMMIT]]),
      })

      await expect(main(LAND, context(remote))).resolves.toBe(0)

      expectNothingPushed(remote)
      expect(log).toHaveBeenCalledWith(`main is already at ${COMMIT}`)
      expect(log).toHaveBeenCalledWith(`v0.1.1 already tags ${COMMIT}`)
    })

    it('should leave main untouched and say so when main moved', async () => {
      const remote = fakeRemote({ branches: new Map([['main', OTHER_COMMIT]]) })

      await expect(main(LAND, context(remote))).resolves.toBe(1)

      expectNothingPushed(remote)
      const problem =
        `main moved while the release ran: it was prepared on ${BASE}, and main is now at ` +
        `${OTHER_COMMIT}. main, the tags and the releases are untouched: run the Release workflow ` +
        'again to release from the new main.'
      expect(error).toHaveBeenCalledWith(`✘ ${problem}`)
      expect(await readText(summary)).toBe(`**Not released.** ${problem}\n`)
    })

    it('should touch nothing when the tag is on another commit', async () => {
      const remote = fakeRemote({
        branches: new Map([['main', BASE]]),
        tags: new Map([['v0.1.1', OTHER_COMMIT]]),
      })

      await expect(main(LAND, context(remote, {}))).resolves.toBe(1)

      expectNothingPushed(remote)
      expect(error).toHaveBeenCalledWith(`✘ v0.1.1 already tags ${OTHER_COMMIT}, not ${COMMIT}`)
    })

    it.each([
      { arguments: 'no tag', args: ['--commit', COMMIT, '--base', BASE] },
      {
        arguments: 'a tag that is not a version',
        args: ['--tag', 'latest', '--commit', COMMIT, '--base', BASE],
      },
      { arguments: 'no base', args: ['--tag', 'v0.1.1', '--commit', COMMIT] },
      {
        arguments: 'a short commit',
        args: ['--tag', 'v0.1.1', '--commit', 'bbbbbbb', '--base', BASE],
      },
      {
        arguments: 'a longer commit',
        args: ['--tag', 'v0.1.1', '--commit', `${COMMIT}0`, '--base', BASE],
      },
      {
        arguments: 'an uppercase base',
        args: ['--tag', 'v0.1.1', '--commit', COMMIT, '--base', BASE.toUpperCase()],
      },
    ])('should refuse $arguments', async ({ args }) => {
      const remote = fakeRemote()

      await expect(main(['land', ...args], context(remote))).resolves.toBe(2)
      expectNothingPushed(remote)
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(
          /^land needs a version --tag and the full hashes of --commit and --base\nusage:/u,
        ),
      )
    })

    it('should take the full hashes of a SHA-256 repository', async () => {
      const base = 'd'.repeat(64)
      const commit = 'e'.repeat(64)
      const remote = fakeRemote({ branches: new Map([['main', base]]) })
      const args = ['land', '--tag', 'v0.1.1', '--commit', commit, '--base', base]

      await expect(main(args, context(remote))).resolves.toBe(0)
      expect(remote.pushCommit).toHaveBeenCalledExactlyOnceWith(commit, 'main')
    })
  })

  describe('cleanup', () => {
    it('should delete the release branch', async () => {
      const remote = fakeRemote({ branches: new Map([['release/v0.1.1', COMMIT]]) })

      await expect(main(['cleanup', '--branch', 'release/v0.1.1'], context(remote))).resolves.toBe(
        0,
      )

      expect(remote.deleteBranch).toHaveBeenCalledExactlyOnceWith('release/v0.1.1')
      expect(log).toHaveBeenCalledWith('Deleted release/v0.1.1')
    })

    it('should do nothing when the branch is gone already', async () => {
      const remote = fakeRemote({ branches: new Map([['main', COMMIT]]) })

      await expect(main(['cleanup', '--branch', 'release/v0.1.1'], context(remote))).resolves.toBe(
        0,
      )

      expect(remote.deleteBranch).not.toHaveBeenCalled()
      expect(log).toHaveBeenCalledWith('release/v0.1.1 is already gone')
    })

    it('should never delete another branch', async () => {
      const remote = fakeRemote({ branches: new Map([['main', COMMIT]]) })

      await expect(main(['cleanup', '--branch', 'main'], context(remote))).resolves.toBe(2)

      expect(remote.deleteBranch).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(/^"main" is not a release branch\nusage:/u),
      )
    })
  })

  it('should refuse an unknown command, and no command', async () => {
    await expect(main(['publish'], context())).resolves.toBe(2)
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^unknown command "publish"\nusage:\n {2}release prepare/u),
    )
    await expect(main([], context())).resolves.toBe(2)
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^unknown command ""\n/u))
  })
})
