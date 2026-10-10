import { describe, expect, it } from 'vitest'

import { checkRelease } from './release-check.ts'

const CHANGELOG = `# Changelog

## [0.1.0] - 2026-10-10

### Added

- The first version.

## [0.0.9] - Unreleased

## [0.0.8] - 2026-01-01
`

describe('checkRelease', () => {
  it('should release the version of package.json whose section is dated', () => {
    expect(
      checkRelease({ tag: 'v0.1.0', packageVersion: '0.1.0', changelog: CHANGELOG }),
    ).toStrictEqual({
      isReady: true,
      version: '0.1.0',
      notes: '### Added\n\n- The first version.',
    })
  })

  it('should refuse a tag that is not a version', () => {
    expect(
      checkRelease({ tag: 'release-1', packageVersion: '0.1.0', changelog: CHANGELOG }),
    ).toStrictEqual({
      isReady: false,
      problems: ['"release-1" is not a version tag such as v1.2.3'],
    })
    expect(checkRelease({ tag: 'v1.2', packageVersion: '1.2', changelog: CHANGELOG }).isReady).toBe(
      false,
    )
  })

  it('should take a pre-release tag', () => {
    const changelog = '## [1.0.0-rc.1] - 2026-12-01\n\n- Almost.'

    expect(
      checkRelease({ tag: 'v1.0.0-rc.1', packageVersion: '1.0.0-rc.1', changelog }),
    ).toMatchObject({
      isReady: true,
      version: '1.0.0-rc.1',
    })
  })

  it('should list every problem: another version in package.json, no section', () => {
    expect(
      checkRelease({ tag: 'v0.2.0', packageVersion: '0.1.0', changelog: CHANGELOG }),
    ).toStrictEqual({
      isReady: false,
      problems: [
        'the tag is v0.2.0 but package.json holds version 0.1.0',
        'CHANGELOG.md has no "## [0.2.0] - YYYY-MM-DD" section',
      ],
    })
  })

  it('should refuse a section without a date or without notes', () => {
    expect(
      checkRelease({ tag: 'v0.0.9', packageVersion: '0.0.9', changelog: CHANGELOG }),
    ).toStrictEqual({
      isReady: false,
      problems: [
        'the CHANGELOG.md section of 0.0.9 is dated "Unreleased": give it the release date (YYYY-MM-DD)',
        'the CHANGELOG.md section of 0.0.9 is empty',
      ],
    })
    expect(
      checkRelease({ tag: 'v0.0.8', packageVersion: '0.0.8', changelog: CHANGELOG }),
    ).toStrictEqual({
      isReady: false,
      problems: ['the CHANGELOG.md section of 0.0.8 is empty'],
    })
  })
})
