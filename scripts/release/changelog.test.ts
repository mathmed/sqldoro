import { describe, expect, it } from 'vitest'

import { findRelease, isReleaseDate, releaseUnreleased } from './changelog.ts'

const CHANGELOG = `# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-01

### Fixed

- Something.

## [0.1.0] - 2026-10-10

### Added

- Everything.

[Unreleased]: https://github.com/mathmed/sqldoro/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mathmed/sqldoro/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mathmed/sqldoro/releases/tag/v0.1.0
`

describe('findRelease', () => {
  it('should take the lines of a version up to the next section', () => {
    expect(findRelease(CHANGELOG, '0.2.0')).toStrictEqual({
      version: '0.2.0',
      date: '2026-11-01',
      notes: '### Fixed\n\n- Something.',
    })
  })

  it('should leave out the link definitions that close the file', () => {
    expect(findRelease(CHANGELOG, '0.1.0')?.notes).toBe('### Added\n\n- Everything.')
  })

  it('should find an undated section, and nothing for a version it does not hold', () => {
    expect(findRelease(CHANGELOG, 'Unreleased')).toStrictEqual({
      version: 'Unreleased',
      date: '',
      notes: '',
    })
    expect(findRelease(CHANGELOG, '9.9.9')).toBeUndefined()
  })
})

describe('isReleaseDate', () => {
  it('should take a date written YYYY-MM-DD only', () => {
    expect(isReleaseDate('2026-10-10')).toBe(true)
    expect(isReleaseDate('Unreleased')).toBe(false)
    expect(isReleaseDate('10/10/2026')).toBe(false)
    expect(isReleaseDate('')).toBe(false)
  })
})

describe('releaseUnreleased', () => {
  const RELEASE = { version: '0.2.1', tag: 'v0.2.1', date: '2026-11-20' }
  const PENDING = CHANGELOG.replace(
    '## [Unreleased]\n',
    '## [Unreleased]\n\n### Fixed\n\n- More.\n',
  )

  it('should date what [Unreleased] lists and move the compare links on to the tag', () => {
    expect(releaseUnreleased(PENDING, RELEASE)).toStrictEqual({
      isReady: true,
      changelog: CHANGELOG.replace(
        '## [Unreleased]\n',
        '## [Unreleased]\n\n## [0.2.1] - 2026-11-20\n\n### Fixed\n\n- More.\n',
      ).replace(
        '[Unreleased]: https://github.com/mathmed/sqldoro/compare/v0.2.0...HEAD\n',
        '[Unreleased]: https://github.com/mathmed/sqldoro/compare/v0.2.1...HEAD\n' +
          '[0.2.1]: https://github.com/mathmed/sqldoro/compare/v0.2.0...v0.2.1\n',
      ),
    })
  })

  it('should leave a CHANGELOG.md it releases readable as that release', () => {
    const sut = releaseUnreleased(PENDING, RELEASE)

    expect(sut.isReady && findRelease(sut.changelog, '0.2.1')).toStrictEqual({
      version: '0.2.1',
      date: '2026-11-20',
      notes: '### Fixed\n\n- More.',
    })
    expect(sut.isReady && findRelease(sut.changelog, 'Unreleased')?.notes).toBe('')
  })

  it('should refuse an empty [Unreleased] section', () => {
    expect(releaseUnreleased(CHANGELOG, RELEASE)).toStrictEqual({
      isReady: false,
      problems: ['the "## [Unreleased]" section of CHANGELOG.md is empty'],
    })
  })

  it('should refuse a CHANGELOG.md without [Unreleased] or its compare link', () => {
    expect(
      releaseUnreleased('# Changelog\n\n## [0.1.0] - 2026-10-10\n\n- One.\n', RELEASE),
    ).toStrictEqual({
      isReady: false,
      problems: [
        'CHANGELOG.md has no "## [Unreleased]" section',
        'CHANGELOG.md has no "[Unreleased]: <repository>/compare/<tag>...HEAD" link',
      ],
    })
  })

  it('should refuse an [Unreleased] link that does not compare with HEAD', () => {
    for (const link of [
      '[Unreleased]: https://github.com/mathmed/sqldoro/compare/v0.2.0...main',
      '[Unreleased]: https://github.com/mathmed/sqldoro/tree/v0.2.0...HEAD',
    ]) {
      const changelog = PENDING.replace(
        '[Unreleased]: https://github.com/mathmed/sqldoro/compare/v0.2.0...HEAD',
        link,
      )

      expect(releaseUnreleased(changelog, RELEASE)).toMatchObject({ isReady: false })
    }
  })

  it('should refuse a version that has a section already', () => {
    expect(releaseUnreleased(PENDING, { ...RELEASE, version: '0.2.0' })).toStrictEqual({
      isReady: false,
      problems: ['CHANGELOG.md already has a section for 0.2.0'],
    })
  })
})
