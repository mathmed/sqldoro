import { describe, expect, it } from 'vitest'

import { findRelease, isReleaseDate } from './changelog.ts'

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
