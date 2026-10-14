import { describe, expect, it } from 'vitest'

import { Bump } from './next-version.ts'
import { type PreparationInputs, prepareRelease } from './preparation.ts'

const CHANGELOG = `# Changelog

## [Unreleased]

- Something new.

## [0.1.2] - 2026-10-13

- Something old.

[Unreleased]: https://github.com/mathmed/sqldoro/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/mathmed/sqldoro/compare/v0.1.1...v0.1.2
`

const INPUTS: PreparationInputs = {
  ref: 'refs/heads/main',
  bump: Bump.Patch,
  requestedVersion: '',
  packageVersion: '0.1.2',
  tagCommits: new Map([['v0.1.2', 'a'.repeat(40)]]),
  changelog: CHANGELOG,
  date: '2026-10-14',
}

describe('prepareRelease', () => {
  it('should prepare the next version, its tag, its branch and its CHANGELOG.md', () => {
    const sut = prepareRelease(INPUTS)

    expect(sut).toMatchObject({
      isReady: true,
      version: '0.1.3',
      tag: 'v0.1.3',
      branch: 'release/v0.1.3',
    })
    expect(sut).toHaveProperty(
      'changelog',
      expect.stringContaining('## [Unreleased]\n\n## [0.1.3] - 2026-10-14\n\n- Something new.'),
    )
  })

  it('should take the exact version asked for', () => {
    expect(prepareRelease({ ...INPUTS, requestedVersion: '1.0.0' })).toMatchObject({
      tag: 'v1.0.0',
    })
  })

  it('should only start from main', () => {
    expect(prepareRelease({ ...INPUTS, ref: 'refs/heads/feature' })).toStrictEqual({
      isReady: false,
      problems: ['a release starts from main, not from refs/heads/feature'],
    })
  })

  it('should refuse a version it cannot choose', () => {
    expect(prepareRelease({ ...INPUTS, requestedVersion: '0.1.1' })).toStrictEqual({
      isReady: false,
      problems: ['0.1.1 does not come after 0.1.2, the version of package.json'],
    })
  })

  it('should refuse a version that is tagged already', () => {
    const tagCommits = new Map([['v0.1.3', 'b'.repeat(40)]])

    expect(prepareRelease({ ...INPUTS, tagCommits })).toStrictEqual({
      isReady: false,
      problems: ['v0.1.3 already exists'],
    })
  })

  it('should refuse a CHANGELOG.md with nothing to release', () => {
    const changelog = CHANGELOG.replace('- Something new.\n\n', '')

    expect(prepareRelease({ ...INPUTS, changelog })).toStrictEqual({
      isReady: false,
      problems: ['the "## [Unreleased]" section of CHANGELOG.md is empty'],
    })
  })
})
